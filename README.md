# Scaramanga

Scaramanga is a lightweight desktop application designed to help users learn Japanese through reading manga. The application allows users to import manga images, annotate them, and manage links to various manga sources.

## Features

- **Integrated Manga Reader**: View manga images with customizable display options (single-page, double-page, vertical scroll).
- **Link Management**: Easily manage a list of manga links stored in a JSON file.
- **Annotations**: Define areas on images for transcriptions and translations.
- **User-Friendly Interface**: Intuitive layout with a sidebar for quick access to links and annotations.

## Project Structure

The project is organized as follows:

```
scaramanga
├── src
│   ├── renderer
│   │   ├── index.tsx          # Entry point for the renderer process
│   │   ├── App.tsx            # Main application component
│   │   ├── components          # Contains Reader and Sidebar components
│   │   ├── hooks               # Custom hooks for managing state
│   │   ├── styles              # SCSS styles
│   │   └── types               # TypeScript types and interfaces
│   └── electron                # Electron main process files
├── data
│   └── links.json             # JSON file storing links and attributes
├── package.json                # NPM configuration file
├── tsconfig.json              # TypeScript configuration file
├── vite.config.ts              # Vite configuration file
├── electron-builder.json       # Electron build configuration
└── README.md                   # Project documentation
```

## Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd scaramanga
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the application:
   ```
   npm run build
   ```

4. Start the application:
   ```
   npm start
   ```

## Usage

- Import manga images by dragging and dropping them into the application or by selecting them from your file system.
- Use the sidebar to manage your list of manga links. You can add, edit, or remove links as needed.
- Annotate images by defining areas for transcription and translation.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for more details.
