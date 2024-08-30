use actix_web::{HttpResponse, ResponseError};
use derive_more::{Display, From};

#[derive(Debug, Display, From)]
pub enum ServerError {
    #[display("Internal Server Error")]
    InternalServerError,
    #[display("Not Found")]
    NotFound,
    #[display("Bad Request: {}", _0)]
    BadRequest(String),
    #[display("Index out of bounds")]
    IndexOutOfBounds,
    #[display("Chunk Missing")]
    ChunkMissing,
    #[display("File Reassembly Error")]
    FileReassemblyError,
    #[display("Metadata Parsing Error")]
    MetadataParsingError,
    #[display("Invalid File")]
    InvalidFile,
}

impl ResponseError for ServerError {
    fn error_response(&self) -> HttpResponse {
        match *self {
            ServerError::InternalServerError => {
                HttpResponse::InternalServerError().body("Internal Server Error")
            }
            ServerError::NotFound => HttpResponse::NotFound().body("Not Found"),
            ServerError::BadRequest(ref message) => {
                HttpResponse::BadRequest().body(message.clone())
            }
            ServerError::IndexOutOfBounds => HttpResponse::BadRequest().body("Index out of bounds"),
            ServerError::ChunkMissing => HttpResponse::BadRequest().body("Chunk Missing"),
            ServerError::FileReassemblyError => {
                HttpResponse::BadRequest().body("File Reassembly Error")
            }
            ServerError::MetadataParsingError => {
                HttpResponse::BadRequest().body("Metadata Parsing Error")
            }
            ServerError::InvalidFile => HttpResponse::BadRequest().body("Invalid File"),
        }
    }
}
