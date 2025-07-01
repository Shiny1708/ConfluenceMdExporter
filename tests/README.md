# Test Files

This directory contains test files and sample data for the Confluence Markdown Exporter.

## Directory Structure

```
tests/
├── samples/          # Sample HTML files for testing
│   ├── test-sample.html     # Basic Confluence page elements
│   └── test-images.html     # Image-rich content
├── outputs/          # Generated test outputs (gitignored)
├── test-conversion.sh       # Test script for conversion features
└── README.md         # This file
```

## Sample Files

### `test-sample.html`
Contains basic Confluence elements:
- Headings and text formatting
- Lists (ordered and unordered)
- Code blocks with syntax highlighting
- Tables
- Links and basic images
- Confluence macros (simulated)
- Blockquotes

### `test-images.html`
Contains comprehensive image scenarios:
- External images
- Confluence attachments (`/download/attachments/`)
- Confluence thumbnails (`/download/thumbnails/`)
- Images with dimensions and styling
- Image galleries
- Images in tables
- Images with special characters in filenames

## Running Tests

### Basic Test Script
```bash
# From project root
./tests/test-conversion.sh
```

### Manual Testing
```bash
# Test basic conversion
npm start convert-html --input tests/samples/test-sample.html --title "Test" --output tests/outputs/

# Test advanced conversion
npm start convert-advanced --input tests/samples/test-sample.html --preview

# Test image conversion
npm start convert-html --input tests/samples/test-images.html --title "Image Test" --output tests/outputs/
```

## Test Outputs

Generated test files are saved to `tests/outputs/` and are gitignored to avoid cluttering the repository.

## Adding New Tests

1. Add new sample HTML files to `tests/samples/`
2. Update `test-conversion.sh` to include new test cases
3. Document new samples in this README

## Expected Behaviors

### Basic Conversion
- Confluence HTML → Clean Markdown
- Preservation of structure and formatting
- Code blocks with proper syntax highlighting
- Tables converted to markdown format

### Image Conversion
- Image URLs preserved with comments
- Alt text and titles maintained
- Dimensions preserved as comments
- Gallery structures marked with comments

### Advanced Options
- Custom bullet markers (-, *, +)
- Different heading styles (atx, setext)
- Code fence variations (```, ~~~)
- Preview mode for testing
