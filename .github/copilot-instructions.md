# Context

The project is a desktop application to learn japansese through reading manga.

# Features

- OCR (Optical Character Recognition) for extracting text from manga images.
- Translation of extracted text from Japanese to French or English.
- Interactive interface for clicking on text bubbles to view translations.
- Manage of a manga library with metadata fetching.

# Technologies

- Electron for building the desktop application.
- TypeScript for application logic.
- React for the user interface.
- Scss for styling.
- manga-ocr for OCR functionality. https://github.com/kha-white/manga-ocr

# Best Practices

## General

- Don't hesitate to create new files and folders to keep the project organized.
- Write clean, readable, and maintainable code.
- Comment your code where necessary to explain complex logic.
- Don't do extra long lines of code, break them into multiple lines if needed.
- Don't hesitate to look for examples through the already existing codebase.

## React

- Use functional components and React hooks like useMemo, useCallback, and useEffect.
- Keep components small and focused on a single responsibility.
- Use prop types or TypeScript interfaces to define component props.
- Try to do generic component when possible.
- use function declaration instead of arrow functions for components.
- Destructure props in the function directly. (const {prop1, prop2} = props)

## Scss

- Use it like scss. Don't hesitate to intricate the structure of your scss files.
- Use variables for colors, font sizes, margins, paddings, etc.
- Use mixins for reusable styles.

# Theme

- The application uses a dark theme with a preference for gray.
- White and light gray are used for text to ensure readability against the dark background.
- Accent colors like blue are used for buttons and highlights.
- Avoid using too many colors to maintain a cohesive look and feel.
