fn main() {
    let mut args = std::env::args().skip(1);
    let mut static_dir = None;
    let mut port = None;

    while let Some(arg) = args.next() {
        if let Some(value) = arg.strip_prefix("--port=") {
            port = parse_port(value);
        } else if arg == "--port" {
            let value = args.next().unwrap_or_else(|| {
                eprintln!("Missing value for --port");
                std::process::exit(2);
            });
            port = parse_port(&value);
        } else if static_dir.is_none() && !arg.is_empty() {
            // Optional: pass a directory path for disk-based static file fallback.
            static_dir = Some(arg);
        } else {
            eprintln!("Unknown argument: {}", arg);
            std::process::exit(2);
        }
    }

    thinkingkity::server::start(static_dir, port);
}

fn parse_port(value: &str) -> Option<u16> {
    match value.parse::<u16>() {
        Ok(port) if port > 0 => Some(port),
        _ => {
            eprintln!("Invalid port: {}", value);
            std::process::exit(2);
        }
    }
}
