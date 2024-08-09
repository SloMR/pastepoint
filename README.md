
# PastePoint

**PastePoint** is a secure file-sharing service designed to facilitate easy and safe file transfers between devices on the same network. It is similar to Snapdrop but offers additional features, focusing on security and compression.

## Features

- **Local Network Chat:** Allows devices on the same network to communicate and share files using WebSockets.
- **Session Management:** Users can list available sessions, create new ones, or join existing sessions.
- **Secure File Sharing:** Prioritizes security in file transfers.
- **File Compression:** Compresses attachments to minimize file size before transfer.

## Technologies Used

- **Rust:** Backend implementation using the Actix Web framework.
- **Angular:** Frontend implementation for user interaction.
- **WebSockets:** Used for real-time communication between devices.

## Table of Contents

1. [Project Structure](#project-structure)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Building the Project](#building-the-project)
5. [Running the Project](#running-the-project)
6. [Usage](#usage)
7. [Contributing](#contributing)
8. [License](#license)

## Project Structure

- **Backend (Rust - Actix Web):**
  - Handles the WebSocket connections, session management, and file compression.
- **Frontend (Angular):**
  - Provides the user interface for interacting with the service, listing sessions, and transferring files.

## Prerequisites

- **Rust:** Install Rust from [rust-lang.org](https://www.rust-lang.org/).
- **Node.js and npm:** Install from [Node.js Official Site](https://nodejs.org/).
- **Angular CLI:** Install Angular CLI globally using npm:

  ```bash
  npm install -g @angular/cli
  ```

## Installation

1. **Clone the repository**:

   ```bash
   git clone https://github.com/SloMR/pastepoint.git
   cd pastepoint
   ```

2. **Install dependencies**:

   - **Backend (Rust) dependencies**:
   
     Rust dependencies are managed via `Cargo.toml` and are automatically handled by Cargo.

   - **Frontend (Angular) dependencies**:

     ```bash
     cd client
     npm install
     ```

## Building the Project

### Building the Backend

1. **Navigate to the backend directory**:

   ```bash
   cd server
   ```

2. **Build the Rust project**:

   ```bash
   cargo build
   ```

   This will create an optimized build of the backend.

### Building the Frontend

1. **Navigate to the frontend directory**:

   ```bash
   cd client
   ```

2. **Build the Angular project**:

   ```bash
   ng build
   ```

   The build artifacts will be stored in the `dist/` directory.

## Running the Project

### Running the Backend

1. **Navigate to the backend directory**:

   ```bash
   cd server
   ```

2. **Run the backend**:

   ```bash
   cargo run
   ```

   The backend server will start and listen for WebSocket connections.

### Running the Frontend

1. **Navigate to the frontend directory**:

   ```bash
   cd client
   ```

2. **Serve the Angular project**:

   ```bash
   ng serve
   ```

   The application will be available at `http://localhost:4200`.

## Usage

Once both the frontend and backend are running:

1. Open your browser and navigate to `http://localhost:4200`.
2. Use the interface to list available sessions or create a new one.
3. Share files securely with other devices on the same network.

## Contributing

Contributions are welcome! Please fork the repository and create a pull request with your changes.
