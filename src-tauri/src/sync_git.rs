use std::path::PathBuf;
use std::process::Command;
use crate::sync_common::SyncResult;

const COMMIT_MSG: &str = "thinkingkity vault sync";

fn resolve_vault_path(vault_path: &str) -> Result<PathBuf, String> {
    let path = std::path::Path::new(vault_path);
    if !path.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }
    path.canonicalize().map_err(|e| format!("Invalid vault path: {}", e))
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
        let msg = if !stderr.trim().is_empty() { stderr } else { stdout };
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
    let entry = ".thinkingkity/";
    if gitignore.exists() {
        let content = std::fs::read_to_string(&gitignore).unwrap_or_default();
        if content.lines().any(|l| l.trim() == entry) {
            return Ok(());
        }
        let updated = format!("{}\n{}\n", content.trim_end(), entry);
        std::fs::write(&gitignore, updated).map_err(|e| e.to_string())?;
    } else {
        std::fs::write(&gitignore, format!("{}\n", entry)).map_err(|e| e.to_string())?;
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

#[tauri::command]
pub fn sync_git_init(
    vault_path: String,
    remote_url: String,
    branch: String,
) -> Result<SyncResult, String> {
    check_git_installed()?;
    let vault = resolve_vault_path(&vault_path)?;

    ensure_git_repo(&vault)?;
    ensure_gitignore(&vault)?;
    ensure_remote(&vault, &remote_url)?;

    let mut messages: Vec<String> = vec![];
    let errors: Vec<String> = vec![];

    // Create branch locally if it doesn't exist
    let branch_check = run_git(&vault, &["rev-parse", "--verify", &branch]);
    if branch_check.is_err() {
        run_git(&vault, &["checkout", "-b", &branch])?;
        messages.push(format!("Created branch '{}'.", branch));
    }

    // Check if remote branch exists
    let remote_has_branch = match run_git(&vault, &["ls-remote", "--heads", "origin", &branch]) {
        Ok(output) => !output.trim().is_empty(),
        Err(_) => false,
    };

    if remote_has_branch {
        match run_git(&vault, &["pull", "origin", &branch]) {
            Ok(output) => {
                if !output.contains("Already up to date") {
                    messages.push(format!("Pulled: {}", output));
                }
            }
            Err(e) => {
                messages.push(format!("Pull failed: {}", e.trim()));
            }
        }
    } else {
        messages.push("Remote is empty, creating initial commit.".to_string());
        run_git(&vault, &["add", "-A"])?;
        let status = run_git(&vault, &["status", "--porcelain"]).unwrap_or_default();
        if status.trim().is_empty() {
            run_git(&vault, &["commit", "--allow-empty", "-m", COMMIT_MSG])?;
        } else {
            run_git(&vault, &["commit", "-m", COMMIT_MSG])?;
        }
        match run_git(&vault, &["push", "-u", "origin", &branch]) {
            Ok(_) => {
                messages.push("Remote branch created.".to_string());
            }
            Err(e) => {
                messages.push(format!("Push failed: {}", e.trim()));
            }
        }
    }

    Ok(SyncResult {
        success: true,
        message: messages.join("\n"),
        files_changed: 0,
        errors,
    })
}

#[tauri::command]
pub fn sync_git_sync(
    vault_path: String,
    remote_url: String,
    branch: String,
) -> Result<SyncResult, String> {
    check_git_installed()?;
    let vault = resolve_vault_path(&vault_path)?;

    ensure_git_repo(&vault)?;
    ensure_gitignore(&vault)?;
    ensure_remote(&vault, &remote_url)?;

    let mut messages: Vec<String> = vec![];
    let errors: Vec<String> = vec![];

    // Check if remote branch exists
    let remote_has_branch = match run_git(&vault, &["ls-remote", "--heads", "origin", &branch]) {
        Ok(output) => !output.trim().is_empty(),
        Err(_) => false,
    };

    if remote_has_branch {
        match run_git(&vault, &["pull", "--rebase", "origin", &branch]) {
            Ok(output) => {
                if !output.contains("Already up to date") {
                    messages.push(format!("Pulled: {}", output));
                }
            }
            Err(_) => {
                let _ = run_git(&vault, &["rebase", "--abort"]);
                let _ = run_git(&vault, &["merge", "--abort"]);
                messages.push("Pull conflict, local will take precedence.".to_string());
            }
        }
    } else {
        messages.push("Remote branch does not exist yet, will create it.".to_string());
    }

    run_git(&vault, &["add", "-A"])?;

    let status = run_git(&vault, &["status", "--porcelain"]).unwrap_or_default();
    let has_changes = !status.trim().is_empty();

    if has_changes {
        let file_count = status.lines().count() as u32;
        run_git(&vault, &["commit", "-m", COMMIT_MSG])?;

        match run_git(&vault, &["push", "-u", "origin", &branch]) {
            Ok(_) => Ok(SyncResult {
                success: true,
                message: messages.join("\n"),
                files_changed: file_count,
                errors,
            }),
            Err(_) => {
                match run_git(&vault, &["push", "--force", "origin", &branch]) {
                    Ok(_) => {
                        messages.push("Force-pushed, local took precedence over remote.".to_string());
                        Ok(SyncResult {
                            success: true,
                            message: messages.join("\n"),
                            files_changed: file_count,
                            errors,
                        })
                    }
                    Err(e2) => Ok(SyncResult {
                        success: false,
                        message: "Push failed after retry.".to_string(),
                        files_changed: file_count,
                        errors: vec![e2],
                    }),
                }
            }
        }
    } else {
        Ok(SyncResult {
            success: true,
            message: if messages.is_empty() {
                "Already up to date.".to_string()
            } else {
                messages.join("\n")
            },
            files_changed: 0,
            errors,
        })
    }
}
