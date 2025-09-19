use crate::CONTENT_TYPE_TEXT_PLAIN;
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
            ServerError::InternalServerError => HttpResponse::InternalServerError()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("Internal Server Error"),
            ServerError::NotFound => HttpResponse::NotFound()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("Not Found"),
            ServerError::BadRequest(ref message) => HttpResponse::BadRequest()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body(message.clone()),
            ServerError::IndexOutOfBounds => HttpResponse::BadRequest()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("Index out of bounds"),
            ServerError::ChunkMissing => HttpResponse::BadRequest()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("Chunk Missing"),
            ServerError::FileReassemblyError => HttpResponse::BadRequest()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("File Reassembly Error"),
            ServerError::MetadataParsingError => HttpResponse::BadRequest()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("Metadata Parsing Error"),
            ServerError::InvalidFile => HttpResponse::BadRequest()
                .content_type(CONTENT_TYPE_TEXT_PLAIN)
                .body("Invalid File"),
        }
    }
}
