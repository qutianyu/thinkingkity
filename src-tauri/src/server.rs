use tiny_http::{Header, Method, Request, Response, Server, StatusCode};
use std::io::Read;
use std::path::Path;
use std::str::FromStr;
use rust_embed::RustEmbed;

use crate::fs_ops;
use crate::global_config;

const DEFAULT_PORT: u16 = 19840;
const DEV_VITE_PORT: u16 = 1420;

#[derive(RustEmbed)]
#[folder = "../dist/"]
struct DistAssets;

// ── helpers ──

fn cors_headers() -> Vec<Header> {
    vec![
        Header::from_str("Access-Control-Allow-Origin: *").unwrap(),
        Header::from_str("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS").unwrap(),
        Header::from_str("Access-Control-Allow-Headers: Content-Type").unwrap(),
    ]
}

fn json_response(status: StatusCode, body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let data = body.as_bytes().to_vec();
    let len = data.len();
    let mut headers = cors_headers();
    headers.push(Header::from_str("Content-Type: application/json; charset=utf-8").unwrap());
    Response::new(
        status,
        headers,
        std::io::Cursor::new(data),
        Some(len),
        None,
    )
}

fn text_response(body: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let data = body.as_bytes().to_vec();
    let len = data.len();
    let mut headers = cors_headers();
    headers.push(Header::from_str("Content-Type: text/plain; charset=utf-8").unwrap());
    Response::new(
        StatusCode(200),
        headers,
        std::io::Cursor::new(data),
        Some(len),
        None,
    )
}

fn ok_json(data: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    json_response(StatusCode(200), data)
}

fn ok_text(data: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    text_response(data)
}

fn err_json(status: StatusCode, msg: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = serde_json::json!({ "error": msg }).to_string();
    json_response(status, &body)
}

fn parse_query_param(url: &str, key: &str) -> Option<String> {
    let query_start = url.find('?')?;
    let query = &url[query_start + 1..];
    let prefix = format!("{}=", key);
    for part in query.split('&') {
        if part.starts_with(&prefix) {
            let raw = &part[prefix.len()..];
            let decoded = percent_decode(raw);
            return Some(decoded);
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut i = 0;
    let bytes = s.as_bytes();
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(decoded) = u8::from_str_radix(
                &s[i + 1..i + 3], 16
            ) {
                result.push(decoded as char);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            result.push(' ');
            i += 1;
            continue;
        }
        result.push(bytes[i] as char);
        i += 1;
    }
    result
}

fn parse_json_body(request: &mut Request) -> Result<serde_json::Value, String> {
    let mut body = String::new();
    request.as_reader().read_to_string(&mut body).map_err(|e| e.to_string())?;
    serde_json::from_str(&body).map_err(|e| format!("Invalid JSON: {}", e))
}

fn read_json_field(val: &serde_json::Value, field: &str) -> Option<String> {
    val.get(field).and_then(|v| v.as_str()).map(|s| s.to_string())
}

// ── route handlers ──

fn handle_health() -> Response<std::io::Cursor<Vec<u8>>> {
    ok_json(r#"{"status":"ok"}"#)
}

fn handle_read_directory(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let path = match parse_query_param(url, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' parameter"),
    };
    match fs_ops::read_directory(&path) {
        Ok(entries) => ok_json(&serde_json::to_string(&entries).unwrap_or_default()),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_read_file(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let path = match parse_query_param(url, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' parameter"),
    };
    match fs_ops::read_file(&path) {
        Ok(content) => ok_text(&content),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_read_file_base64(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let path = match parse_query_param(url, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' parameter"),
    };
    match fs_ops::read_file_base64(&path) {
        Ok(data_url) => ok_text(&data_url),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_get_vault_size(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let path = match parse_query_param(url, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' parameter"),
    };
    match fs_ops::get_vault_size(&path) {
        Ok(size) => ok_text(&size.to_string()),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_write_file(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let path = match read_json_field(&body, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' field"),
    };
    let content = match read_json_field(&body, "content") {
        Some(c) => c,
        None => return err_json(StatusCode(400), "Missing 'content' field"),
    };
    match fs_ops::write_file(&path, &content) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_write_file_base64(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let path = match read_json_field(&body, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' field"),
    };
    let content = match read_json_field(&body, "content") {
        Some(c) => c,
        None => return err_json(StatusCode(400), "Missing 'content' field"),
    };
    match fs_ops::write_file_base64(&path, &content) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_create_file(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let path = match read_json_field(&body, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' field"),
    };
    match fs_ops::create_file(&path) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_create_folder(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let path = match read_json_field(&body, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' field"),
    };
    match fs_ops::create_folder(&path) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_copy_file(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let source = match read_json_field(&body, "sourcePath") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'sourcePath' field"),
    };
    let destination = match read_json_field(&body, "destinationPath") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'destinationPath' field"),
    };
    match fs_ops::copy_file(&source, &destination) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_rename_file(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let old = match read_json_field(&body, "oldPath") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'oldPath' field"),
    };
    let new = match read_json_field(&body, "newPath") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'newPath' field"),
    };
    match fs_ops::rename_file(&old, &new) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_delete_file(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    let path = match parse_query_param(url, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' parameter"),
    };
    match fs_ops::delete_file(&path) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_write_vault_markdown(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let vault_path = match read_json_field(&body, "vaultPath") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'vaultPath' field"),
    };
    let relative_path = match read_json_field(&body, "relativePath") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'relativePath' field"),
    };
    let content = match read_json_field(&body, "content") {
        Some(c) => c,
        None => return err_json(StatusCode(400), "Missing 'content' field"),
    };
    match fs_ops::write_vault_markdown_file(&vault_path, &relative_path, &content) {
        Ok(target) => ok_text(&target),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_list_vaults() -> Response<std::io::Cursor<Vec<u8>>> {
    match fs_ops::list_vaults() {
        Ok(vaults) => ok_json(&serde_json::to_string(&vaults).unwrap_or_default()),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_list_allowed_paths() -> Response<std::io::Cursor<Vec<u8>>> {
    match global_config::get_allowed_paths() {
        Ok(paths) => ok_json(&serde_json::to_string(&paths).unwrap_or_default()),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_ensure_allowed_path(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let path = match read_json_field(&body, "path") {
        Some(p) => p,
        None => return err_json(StatusCode(400), "Missing 'path' field"),
    };
    match global_config::ensure_allowed_path(&path) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_ensure_demo_vault() -> Response<std::io::Cursor<Vec<u8>>> {
    match global_config::ensure_demo_vault() {
        Ok(path) => ok_text(&path),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_browse_page(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let url = match read_json_field(&body, "url") {
        Some(u) => u,
        None => return err_json(StatusCode(400), "Missing 'url' field"),
    };
    let options = read_json_field(&body, "options");
    match fs_ops::browse_page_with_playwright(url, options) {
        Ok(text) => ok_text(&text),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

fn handle_write_global_vaults(request: &mut Request) -> Response<std::io::Cursor<Vec<u8>>> {
    let body = match parse_json_body(request) {
        Ok(b) => b,
        Err(e) => return err_json(StatusCode(400), &e),
    };
    let vaults: Vec<String> = body
        .get("vaults")
        .and_then(|v| v.as_array())
        .map(|a| a.iter().filter_map(|x| x.as_str().map(String::from)).collect())
        .unwrap_or_default();
    match global_config::write_global_vaults(vaults) {
        Ok(()) => ok_json(r#"{"ok":true}"#),
        Err(e) => err_json(StatusCode(500), &e),
    }
}

// ── dev proxy ──

fn dev_mode() -> bool {
    std::env::var("THINKINGKITY_DEV").is_ok()
}

fn proxy_to_vite(url: &str) -> Response<std::io::Cursor<Vec<u8>>> {
    use std::thread::sleep;
    use std::time::Duration;

    let vite_url = format!("http://localhost:{}{}", DEV_VITE_PORT, url);
    // Retry — Vite may still be starting up.
    let call = (0..5)
        .find_map(|i| {
            if i > 0 { sleep(Duration::from_millis(500)); }
            ureq::get(&vite_url).call().ok()
        });
    let call = match call {
        Some(r) => r,
        None => return err_json(StatusCode(502), "Vite dev server not reachable after retries"),
    };
    let ct: &str = call.headers().get("Content-Type")
        .and_then(|v: &ureq::http::HeaderValue| v.to_str().ok())
        .unwrap_or("text/html");
    let mime = ct.to_string();
    let data = {
        let mut buf = Vec::new();
        if call.into_body().as_reader().read_to_end(&mut buf).is_err() {
            return err_json(StatusCode(502), "Failed to read Vite response");
        }
        buf
    };
    let len = data.len();
    let headers = vec![
        Header::from_str(&format!("Content-Type: {}", mime)).unwrap(),
        Header::from_str("Access-Control-Allow-Origin: *").unwrap(),
    ];
    Response::new(StatusCode(200), headers, std::io::Cursor::new(data), Some(len), None)
}

// ── static file serving ──

fn embedded_file_response(asset_path: &str) -> Option<Response<std::io::Cursor<Vec<u8>>>> {
    let data = DistAssets::get(asset_path)?;
    let mime = mime_guess::from_path(asset_path).first_or_octet_stream();
    let bytes = data.data.to_vec();
    let len = bytes.len();
    let headers = vec![
        Header::from_str(&format!("Content-Type: {}", mime)).unwrap(),
        Header::from_str("Access-Control-Allow-Origin: *").unwrap(),
    ];
    Some(Response::new(
        StatusCode(200),
        headers,
        std::io::Cursor::new(bytes),
        Some(len),
        None,
    ))
}

/// Try embedded assets first, fall back to disk, fall back to index.html (SPA).
fn serve_static(path: &str, static_dir: Option<&str>) -> Response<std::io::Cursor<Vec<u8>>> {
    let file_path = if path.is_empty() || path == "/" {
        "index.html".to_string()
    } else {
        path.trim_start_matches('/').to_string()
    };

    // 1) Try embedded assets.
    if let Some(resp) = embedded_file_response(&file_path) {
        return resp;
    }
    // 2) SPA fallback: try embedded index.html.
    if let Some(resp) = embedded_file_response("index.html") {
        return resp;
    }

    // 3) Disk-based fallback.
    if let Some(dir) = static_dir {
        let full = Path::new(dir).join(&file_path);
        if let Ok(data) = std::fs::read(&full) {
            let mime = mime_guess::from_path(&full).first_or_octet_stream();
            let len = data.len();
            let headers = vec![
                Header::from_str(&format!("Content-Type: {}", mime)).unwrap(),
                Header::from_str("Access-Control-Allow-Origin: *").unwrap(),
            ];
            return Response::new(
                StatusCode(200),
                headers,
                std::io::Cursor::new(data),
                Some(len),
                None,
            );
        }
        // SPA fallback from disk.
        let index = Path::new(dir).join("index.html");
        if let Ok(data) = std::fs::read(&index) {
            let len = data.len();
            let headers = vec![
                Header::from_str("Content-Type: text/html; charset=utf-8").unwrap(),
                Header::from_str("Access-Control-Allow-Origin: *").unwrap(),
            ];
            return Response::new(
                StatusCode(200),
                headers,
                std::io::Cursor::new(data),
                Some(len),
                None,
            );
        }
    }

    err_json(StatusCode(404), "Not found")
}

fn handle_options() -> Response<std::io::Cursor<Vec<u8>>> {
    let headers = vec![
        Header::from_str("Access-Control-Allow-Origin: *").unwrap(),
        Header::from_str("Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS").unwrap(),
        Header::from_str("Access-Control-Allow-Headers: Content-Type").unwrap(),
    ];
    Response::new(
        StatusCode(204),
        headers,
        std::io::Cursor::new(Vec::new()),
        Some(0),
        None,
    )
}

// ── public entry ──

pub fn start(static_dir: Option<String>) {
    let port = std::env::var("THINKINGKITY_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(DEFAULT_PORT);

    let addr = format!("0.0.0.0:{}", port);
    let server = Server::http(&addr).unwrap_or_else(|e| {
        eprintln!("Failed to start HTTP server on {}: {}", addr, e);
        std::process::exit(1);
    });

    let url = format!("http://localhost:{}", port);
    let label = format!("Open: {}", url);
    let width = label.len() + 4; // 2 space padding each side
    let bar = "═".repeat(width);
    if dev_mode() {
        println!("Vite  (HMR)  → http://localhost:{}", DEV_VITE_PORT);
    }
    println!();
    println!("╔{}╗", bar);
    println!("║  {}  ║", label);
    println!("╚{}╝", bar);
    if let Some(ref dir) = static_dir {
        println!("Static fallback dir: {}", dir);
    }

    for mut request in server.incoming_requests() {
        let method = request.method();
        let url = request.url().to_string();

        // Parse path without query
        let path = url.split('?').next().unwrap_or(&url).to_string();

        // OPTIONS preflight
        if method == &Method::Options {
            let _ = request.respond(handle_options());
            continue;
        }

        let response = match (method, path.as_str()) {
            (&Method::Get, "/api/health") => handle_health(),
            (&Method::Get, "/api/read-directory") => handle_read_directory(&url),
            (&Method::Get, "/api/read-file") => handle_read_file(&url),
            (&Method::Get, "/api/read-file-base64") => handle_read_file_base64(&url),
            (&Method::Get, "/api/get-vault-size") => handle_get_vault_size(&url),
            (&Method::Get, "/api/list-vaults") => handle_list_vaults(),
            (&Method::Get, "/api/list-allowed-paths") => handle_list_allowed_paths(),
            (&Method::Get, "/api/ensure-demo-vault") => handle_ensure_demo_vault(),
            (&Method::Post, "/api/ensure-allowed-path") => {
                handle_ensure_allowed_path(&mut request)
            }
            (&Method::Get, "/api/read-global-vaults") => {
                match global_config::read_global_vaults() {
                    Ok(v) => ok_json(&serde_json::to_string(&v).unwrap_or_default()),
                    Err(e) => err_json(StatusCode(500), &e),
                }
            }
            (&Method::Post, "/api/write-file") => handle_write_file(&mut request),
            (&Method::Post, "/api/write-file-base64") => {
                handle_write_file_base64(&mut request)
            }
            (&Method::Post, "/api/create-file") => handle_create_file(&mut request),
            (&Method::Post, "/api/create-folder") => handle_create_folder(&mut request),
            (&Method::Post, "/api/copy-file") => handle_copy_file(&mut request),
            (&Method::Post, "/api/rename-file") => handle_rename_file(&mut request),
            (&Method::Post, "/api/write-vault-markdown") => handle_write_vault_markdown(&mut request),
            (&Method::Post, "/api/browse-page") => handle_browse_page(&mut request),
            (&Method::Post, "/api/write-global-vaults") => {
                handle_write_global_vaults(&mut request)
            }
            (&Method::Get, "/api/delete-file") | (&Method::Delete, "/api/delete-file") => {
                handle_delete_file(&url)
            }

            // Static file serving: dev proxy or embedded/disk
            _ => {
                if dev_mode() {
                    proxy_to_vite(&url)
                } else {
                    serve_static(&path, static_dir.as_deref())
                }
            }
        };

        let _ = request.respond(response);
    }
}
