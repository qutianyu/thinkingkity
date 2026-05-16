use crate::git_config;
use crate::sync_common::SyncResult;
use chrono::Local;
use std::path::PathBuf;
use std::process::Command;

const COMMIT_MSG: &str = "thinkingkity vault sync";

fn commit_message() -> String {
    format!("{} {}", COMMIT_MSG, Local::now().format("%Y-%m-%d %H:%M:%S"))
}

fn resolve_vault_path(vault_path: &str) -> Result<PathBuf, String> {
    let path = std::path::Path::new(vault_path);
    if !path.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }
    path.canonicalize()
        .map_err(|e| format!("Invalid vault path: {}", e))
}

fn check_git_installed() -> Result<(), String> {
    let output = Command::new("git")
        .arg("--version")
        .output()
        .map_err(|_| "Git is not installed. Please install git first.".to_string())?;
    if !output.status.success() {
        return Err("Git is not installed. Please install git first.".to_string());
    }
    Ok(())
}

fn run_git(vault_path: &PathBuf, args: &[&str]) -> Result<String, String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(vault_path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let msg = if !stderr.trim().is_empty() {
            stderr
        } else {
            stdout
        };
        return Err(msg.trim().to_string());
    }

    Ok(stdout.trim().to_string())
}

fn ensure_git_repo(vault_path: &PathBuf) -> Result<(), String> {
    let git_dir = vault_path.join(".git");
    if git_dir.is_dir() {
        return Ok(());
    }
    run_git(vault_path, &["init"])?;
    Ok(())
}

fn ensure_gitignore(vault_path: &PathBuf) -> Result<(), String> {
    let gitignore = vault_path.join(".gitignore");
    let entries = [
        ".DS_Store",
        ".thinkingkity/ai-config.json",
        ".thinkingkity/git-config.json",
        ".thinkingkity/github-config.json",
    ];
    if gitignore.exists() {
        let content = std::fs::read_to_string(&gitignore).unwrap_or_default();
        let mut lines: Vec<String> = content
            .lines()
            .filter_map(|line| {
                let trimmed = line.trim();
                if trimmed == ".thinkingkity/"
                    || trimmed == ".thinkingkity"
                    || trimmed == ".thinkingkity/*"
                    || trimmed == ".thinkingkity/**"
                    || entries.contains(&trimmed)
                {
                    None
                } else {
                    Some(line.to_string())
                }
            })
            .collect();
        lines.extend(entries.iter().map(|entry| entry.to_string()));
        let mut updated = lines.join("\n");
        updated.push('\n');
        if updated != content {
            std::fs::write(&gitignore, updated).map_err(|e| e.to_string())?;
        }
    } else {
        std::fs::write(&gitignore, format!("{}\n", entries.join("\n"))).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn ensure_remote(vault_path: &PathBuf, remote_url: &str) -> Result<(), String> {
    let remotes = run_git(vault_path, &["remote"]).unwrap_or_default();
    if remotes.contains("origin") {
        let current_url = run_git(vault_path, &["remote", "get-url", "origin"]).unwrap_or_default();
        if current_url.trim() != remote_url.trim() {
            run_git(vault_path, &["remote", "set-url", "origin", remote_url])?;
        }
    } else {
        run_git(vault_path, &["remote", "add", "origin", remote_url])?;
    }
    Ok(())
}

/// Load credentials from `.thinkingkity/git-config.json`.
fn load_git_credentials(vault_path: &PathBuf) -> (String, String) {
    if let Ok(config) = git_config::read_git_config(vault_path) {
        if !config.username.is_empty() && !config.token.is_empty() {
            return (config.username, config.token);
        }
    }
    (String::new(), String::new())
}

/// Detect known git auth failures and return a user-friendly message.
fn maybe_auth_error(err: &str) -> Option<String> {
    let lower = err.to_lowercase();
    if lower.contains("invalid username or password")
        || lower.contains("authentication failed")
        || lower.contains("could not read password")
        || lower.contains("could not read username")
        || lower.contains("not authorized")
        || lower.contains("remote: repository not found")
    {
        Some(format!(
            "Git authentication failed. Check your username and token.\n\
             Go to Settings → Sync and update your Git credentials.\n\
             Original error: {}",
            err.trim()
        ))
    } else {
        None
    }
}

fn is_non_fast_forward_error(err: &str) -> bool {
    let lower = err.to_lowercase();
    lower.contains("non-fast-forward")
        || lower.contains("fetch first")
        || lower.contains("rejected")
}

fn authenticated_remote_url(remote_url: &str, username: &str, token: &str) -> String {
    if username.is_empty()
        || token.is_empty()
        || !remote_url.starts_with("https://")
        || remote_url.contains('@')
    {
        return remote_url.to_string();
    }

    match url::Url::parse(remote_url) {
        Ok(mut url) => {
            let _ = url.set_username(username);
            let _ = url.set_password(Some(token));
            url.to_string()
        }
        Err(_) => remote_url.to_string(),
    }
}

#[tauri::command]
pub fn github_pull_remote(
    vault_path: String,
    remote_url: String,
    branch: String,
) -> Result<SyncResult, String> {
    check_git_installed()?;
    let vault = resolve_vault_path(&vault_path)?;

    ensure_git_repo(&vault)?;
    ensure_gitignore(&vault)?;
    ensure_remote(&vault, &remote_url)?;
    let (username, token) = load_git_credentials(&vault);
    let auth_remote = authenticated_remote_url(&remote_url, &username, &token);

    let mut messages: Vec<String> = vec![];
    let mut errors: Vec<String> = vec![];

    // Create branch locally if it doesn't exist
    let branch_check = run_git(&vault, &["rev-parse", "--verify", &branch]);
    if branch_check.is_err() {
        run_git(&vault, &["checkout", "-b", &branch])?;
        messages.push(format!("Created branch '{}'.", branch));
    }

    // Check if remote branch exists
    let remote_has_branch = match run_git(&vault, &["ls-remote", "--heads", &auth_remote, &branch]) {
        Ok(output) => !output.trim().is_empty(),
        Err(e) => {
            if let Some(hint) = maybe_auth_error(&e) {
                return Ok(SyncResult {
                    success: false,
                    message: "Failed to access remote repository.".to_string(),
                    files_changed: 0,
                    errors: vec![hint],
                });
            }
            false
        }
    };

    if !remote_has_branch {
        return Ok(SyncResult {
            success: false,
            message: format!("Remote branch '{}' does not exist.", branch),
            files_changed: 0,
            errors: vec!["Nothing can be downloaded from GitHub yet.".to_string()],
        });
    }

    let branch_exists_locally = run_git(&vault, &["rev-parse", "--verify", &branch]).is_ok();
    if branch_exists_locally {
        match run_git(&vault, &["pull", "--rebase", &auth_remote, &branch]) {
            Ok(_) => {
                messages.push("Downloaded latest files from GitHub.".to_string());
            }
            Err(e) => {
                if let Some(hint) = maybe_auth_error(&e) {
                    errors.push(hint);
                } else {
                    errors.push(format!("Push failed: {}", e.trim()));
                }
            }
        }
    } else {
        run_git(&vault, &["fetch", &auth_remote, &branch])?;
        run_git(&vault, &["checkout", "-B", &branch, "FETCH_HEAD"])?;
        messages.push("Downloaded repository from GitHub.".to_string());
    }

    if messages.is_empty() {
        messages.push("Local repository is already up to date with GitHub.".to_string());
    }

    Ok(SyncResult {
        success: errors.is_empty(),
        message: messages.join("\n"),
        files_changed: 0,
        errors,
    })
}

#[tauri::command]
pub fn github_push_local(
    vault_path: String,
    remote_url: String,
    branch: String,
) -> Result<SyncResult, String> {
    check_git_installed()?;
    let vault = resolve_vault_path(&vault_path)?;

    ensure_git_repo(&vault)?;
    ensure_gitignore(&vault)?;
    ensure_remote(&vault, &remote_url)?;
    let (username, token) = load_git_credentials(&vault);
    let auth_remote = authenticated_remote_url(&remote_url, &username, &token);

    let mut messages: Vec<String> = vec![];
    let errors: Vec<String> = vec![];

    // Check if remote branch exists
    let remote_has_branch = match run_git(&vault, &["ls-remote", "--heads", &auth_remote, &branch]) {
        Ok(output) => !output.trim().is_empty(),
        Err(e) => {
            if let Some(hint) = maybe_auth_error(&e) {
                return Ok(SyncResult {
                    success: false,
                    message: "Failed to access remote repository.".to_string(),
                    files_changed: 0,
                    errors: vec![hint],
                });
            }
            false
        }
    };

    if !remote_has_branch {
        messages.push(format!("Remote branch '{}' does not exist yet; it will be created.", branch));
    }

    run_git(&vault, &["add", "-A"])?;

    let status = run_git(&vault, &["status", "--porcelain"]).unwrap_or_default();
    let has_changes = !status.trim().is_empty();

    if has_changes {
        let file_count = status.lines().count() as u32;
        let message = commit_message();
        run_git(&vault, &["commit", "-m", &message])?;

        match run_git(&vault, &["push", "-u", &auth_remote, &branch]) {
            Ok(_) => {
                messages.push(format!("Committed and pushed {} file(s).", file_count));
                Ok(SyncResult {
                    success: true,
                    message: messages.join("\n"),
                    files_changed: file_count,
                    errors,
                })
            }
            Err(e1) => {
                if let Some(hint) = maybe_auth_error(&e1) {
                    return Ok(SyncResult {
                        success: false,
                        message: "Push failed.".to_string(),
                        files_changed: file_count,
                        errors: vec![hint],
                    });
                }

                if !is_non_fast_forward_error(&e1) {
                    return Ok(SyncResult {
                        success: false,
                        message: "Push failed.".to_string(),
                        files_changed: file_count,
                        errors: vec![e1],
                    });
                }

                // Only retry with force when Git explicitly reports a history conflict.
                let retry = run_git(&vault, &["push", "--force", &auth_remote, &branch]);
                match retry {
                    Ok(_) => {
                        messages.push("Force-pushed, local took precedence over remote.".to_string());
                        messages.push(format!("Committed and pushed {} file(s).", file_count));
                        Ok(SyncResult {
                            success: true,
                            message: messages.join("\n"),
                            files_changed: file_count,
                            errors,
                        })
                    }
                    Err(e2) => {
                        let final_err = maybe_auth_error(&e2).unwrap_or_else(|| {
                            format!(
                                "Initial push failed: {}\nForce-push retry failed: {}",
                                e1.trim(),
                                e2.trim()
                            )
                        });
                        Ok(SyncResult {
                            success: false,
                            message: "Push failed after retry.".to_string(),
                            files_changed: file_count,
                            errors: vec![final_err],
                        })
                    }
                }
            }
        }
    } else {
        Ok(SyncResult {
            success: true,
            message: if messages.is_empty() {
                "No local changes to upload.".to_string()
            } else {
                messages.join("\n")
            },
            files_changed: 0,
            errors,
        })
    }
}
