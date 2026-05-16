use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SyncResult {
    pub success: bool,
    pub message: String,
    pub files_changed: u32,
    pub errors: Vec<String>,
    pub logs: Vec<String>,
}
