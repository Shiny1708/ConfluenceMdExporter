# Confluence Markdown Exporter

A TypeScript-based tool to export Confluence pages to Markdown format using the Confluence REST API.

## Features

- Export entire Confluence spaces to Markdown
- Export individual pages by ID
- Convert HTML content to clean Markdown format
- Support for username/password authentication
- Configurable via environment variables
- Command-line interface for easy usage
- Handles Confluence-specific elements and macros

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Access to a Confluence instance with API permissions

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd confluence-md-exporter
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example environment file and configure it:
```bash
cp .env.example .env
```

4. Edit the `.env` file with your Confluence details:
```env
CONFLUENCE_BASE_URL=https://your-domain.atlassian.net
CONFLUENCE_USERNAME=your-email@example.com
CONFLUENCE_PASSWORD=your-api-token
OUTPUT_DIR=./exports
SPACE_KEY=YOUR_SPACE_KEY
```

**Note:** For Atlassian Cloud, use an API token instead of your password. Generate one at: https://id.atlassian.com/manage-profile/security/api-tokens

## Usage

### Build the project

```bash
npm run build
```

### Run commands

#### List available spaces
```bash
npm start list-spaces
```

#### Export entire space
```bash
npm start export-space --space DEMO
```

#### Export specific page
```bash
npm start export-page --page 123456789
```

#### Search for pages
```bash
npm start search --query "space = DEMO AND title ~ 'API'"
```

#### Convert HTML files (Testing)
```bash
# Basic HTML to Markdown conversion
npm start convert-html --input sample.html --title "My Page"

# Advanced conversion with custom options
npm start convert-advanced --input sample.html \
  --title "My Page" \
  --bullet-marker "*" \
  --fence "~~~" \
  --heading-style "setext" \
  --preview

# Just preview without saving
npm start convert-advanced --input sample.html --preview
```

#### Download images with export
```bash
# Export space and download all images locally
npm start export-space --space DEMO --download-images

# Export specific page with images
npm start export-page --page 123456 --download-images
```

#### Standalone image download
```bash
# Download images from existing markdown file
npm start download-images --input exported-page.md --images-dir ./images

# Update the original file with local image paths
npm start download-images --input exported-page.md --update
```

### Development

Run in development mode without building:
```bash
npm run dev list-spaces
```

## Configuration

### Environment Variables

- `CONFLUENCE_BASE_URL`: Your Confluence base URL (required)
- `CONFLUENCE_USERNAME`: Your username/email (required)
- `CONFLUENCE_PASSWORD`: Your password/API token (required)
- `OUTPUT_DIR`: Directory to save exported files (default: ./exports)
- `SPACE_KEY`: Default space key to export (optional)

### Command Options

Most commands support additional options:

- `--output, -o`: Specify output directory
- `--space, -s`: Specify space key
- `--page, -p`: Specify page ID
- `--query, -q`: Specify search query
- `--limit, -l`: Limit number of results

## Output Format

Exported Markdown files include:

1. **Metadata header** with page information:
   ```markdown
   ---
   title: "Page Title"
   id: "123456789"
   confluence_url: "/wiki/spaces/DEMO/pages/123456789"
   created: "2025-07-01T10:00:00.000Z"
   ---
   ```

2. **Converted content** from Confluence HTML to Markdown

3. **Preserved structure** including:
   - Headings
   - Lists and tables
   - Code blocks with syntax highlighting
   - Links and images
   - Confluence macros (as comments)

## API Authentication

This tool supports:

- **Username/Password** authentication for on-premise Confluence
- **Username/API Token** authentication for Confluence Cloud

For Confluence Cloud, it's recommended to use API tokens instead of passwords for better security.

## Troubleshooting

### Common Issues

1. **Authentication errors**: Verify your credentials and API token
2. **Space not found**: Check the space key is correct and you have access
3. **Rate limiting**: The tool handles pagination automatically, but very large spaces may take time
4. **SSL Certificate errors**: For self-signed certificates, see SSL Configuration below

### SSL Certificate Issues

If you encounter SSL certificate errors (common with self-hosted Confluence instances):

**Method 1: Environment Variable**
```bash
# In your .env file
IGNORE_SSL_ERRORS=true
```

**Method 2: Command Line Flag**
```bash
# Add --ignore-ssl to any command
npm start list-spaces --ignore-ssl
npm start export-space --space DEMO --ignore-ssl
npm start export-page --page 123456 --ignore-ssl
```

**⚠️ Security Warning**: Only use these options in development or trusted environments. Ignoring SSL errors can expose you to security risks.

### CLI Usage Issues

- **export-page command**: Always use the `--page` flag, not a positional argument
  ```bash
  # ✅ Correct
  npm start export-page --page 123456
  
  # ❌ Incorrect  
  npm start export-page 123456
  ```

### Debug Mode

Set the `DEBUG` environment variable to see more detailed output:
```bash
DEBUG=true npm start export-space --space DEMO
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions:
1. Check the [troubleshooting section](#troubleshooting)
2. Search existing [GitHub issues](../../issues)
3. Create a new issue with detailed information about your problem

### 🧪 **Testing and Development Features**

#### Standalone HTML Conversion
For testing and refining the markdown conversion without connecting to Confluence:

1. **Basic conversion**: `npm start convert-html --input file.html`
2. **Advanced conversion**: `npm start convert-advanced --input file.html --preview`
3. **Custom options**: Control heading styles, bullet markers, code fences, etc.
4. **Preview mode**: Test conversions without saving files

#### Test Suite
Run the comprehensive test suite:
```bash
# Run all conversion tests
./tests/test-conversion.sh

# Or test individual components
npm start convert-html --input tests/samples/test-sample.html --preview
npm start convert-html --input tests/samples/test-images.html --preview
```

#### Conversion Options
- **Heading styles**: `atx` (# Header) or `setext` (Header\n=====)
- **Bullet markers**: `-`, `*`, or `+`
- **Code block styles**: `fenced` (\`\`\`) or `indented` (4 spaces)
- **Code fences**: \`\`\` or ~~~

### 🖼️ **Image Handling**

The exporter provides comprehensive support for Confluence images:

#### **Supported Image Types**
- ✅ **External images** (URLs starting with http/https)
- ✅ **Confluence attachments** (`/download/attachments/`)
- ✅ **Confluence thumbnails** (`/download/thumbnails/`)
- ✅ **Image galleries** and macros
- ✅ **Images with custom dimensions** and styling
- ✅ **Inline images** and icons

#### **Image Processing Features**
1. **URL Conversion**: Relative Confluence URLs → Absolute URLs
2. **Metadata Preservation**: Alt text, titles, dimensions preserved
3. **Local Download**: Save images locally with proper authentication
4. **Path Updates**: Automatic markdown link updates to local files
5. **Gallery Support**: Confluence gallery macros converted with comments
6. **Special Characters**: Support for filenames with spaces and Unicode

#### **Download Options**
- **During export**: Use `--download-images` flag with export commands
- **Post-processing**: Use `download-images` command on existing markdown
- **Authentication**: Automatically uses your Confluence credentials
- **Organization**: Images saved in `images/` subdirectory

#### **Example Output**
```markdown
![Screenshot](/download/attachments/123456/screenshot.png "Page Screenshot")
<!-- Confluence Attachment: screenshot.png -->

<!-- Confluence Gallery -->
![Photo 1](./images/photo1.jpg)
![Photo 2](./images/photo2.jpg)
<!-- End Gallery -->
```

### 🚀 **Wiki.js Integration**

The exporter provides seamless integration with Wiki.js, including automatic image uploading and page creation.

#### **Setup Wiki.js Integration**
Add these variables to your `.env` file:
```env
# Wiki.js Configuration
WIKIJS_BASE_URL=https://your-wikijs-instance.com
WIKIJS_API_KEY=your-wikijs-api-key
WIKIJS_UPLOAD_PATH=/uploads
```

**Getting your Wiki.js API Key:**
1. Go to your Wiki.js admin panel
2. Navigate to **System** → **API Access**
3. Create a new API key with appropriate permissions
4. Copy the key to your `.env` file

#### **Direct Confluence → Wiki.js Export**
```bash
# Export entire Confluence space directly to Wiki.js
npm start export-to-wikijs --space DEMO

# With custom settings
npm start export-to-wikijs --space DEMO \
  --upload-path "/my-images" \
  --page-prefix "confluence" \
  --dry-run

# Preview what would be uploaded (no actual changes)
npm start export-to-wikijs --space DEMO --dry-run
```

#### **Convert Existing Markdown to Wiki.js**
```bash
# Convert single markdown file
npm start convert-to-wikijs --input my-page.md --page-path "my-custom-path"

# Convert entire directory of markdown files
npm start convert-to-wikijs --input ./exports/DEMO/

# Preview changes without uploading
npm start convert-to-wikijs --input ./exports/ --dry-run
```

#### **What Happens During Wiki.js Export**
1. **📥 Download**: Fetches pages from Confluence
2. **🖼️ Image Processing**: Downloads Confluence images with authentication
3. **⬆️ Upload Images**: Uploads images to Wiki.js asset storage
4. **🔗 Link Updates**: Updates markdown to use Wiki.js image URLs
5. **📝 Format Conversion**: Converts Confluence-specific elements to Wiki.js format
6. **📚 Page Creation**: Creates or updates pages in Wiki.js

#### **Image Handling in Wiki.js**
- **Automatic upload**: All Confluence images are uploaded to Wiki.js
- **Asset management**: Images stored in Wiki.js asset system
- **Authentication**: Uses your Confluence credentials to download protected images
- **Path optimization**: Images organized in specified upload directory
- **Link updating**: Markdown automatically updated with Wiki.js asset URLs

#### **Confluence → Wiki.js Conversions**
| Confluence Element | Wiki.js Output |
|-------------------|----------------|
| Info macro | `> **Info**` blockquote |
| Warning macro | `> **Warning**` blockquote |
| Code blocks | Preserved with syntax highlighting |
| Tables | Native markdown tables |
| Images | Uploaded assets with proper links |
| Page attachments | Uploaded to Wiki.js asset storage |

#### **Page Organization**
- **Path generation**: Automatic URL-safe path creation
- **Naming**: Based on Confluence page titles
- **Prefixes**: Optional space-based organization
- **Tagging**: Automatic tags for imported content
- **Metadata**: Preservation of creation dates and sources
