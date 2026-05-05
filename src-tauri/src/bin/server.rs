fn main() {
    // Optional: pass a directory path for disk-based static file fallback.
    let static_dir = std::env::args().nth(1).filter(|s| !s.is_empty());
    thinkingkity::server::start(static_dir);
}
