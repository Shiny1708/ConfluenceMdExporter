import TurndownService from 'turndown';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfluencePage } from './types';

export interface ConversionOptions {
  preserveHtmlTables?: boolean;
  pageId?: string;
}

export class MarkdownConverter {
  private turndownService: TurndownService;
  private htmlTableTurndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
    });

    // Create a separate service for HTML table preservation
    this.htmlTableTurndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
    });

    // Add custom rules for Confluence-specific elements
    this.setupCustomRules();
    this.setupHtmlTableRules();
  }

  private setupCustomRules(): void {
    this.applyCustomRules(this.turndownService, '```');
  }

  private setupHtmlTableRules(): void {
    this.applyCustomRules(this.htmlTableTurndownService, '```');
    this.applyHtmlTableRules(this.htmlTableTurndownService);
  }

  /**
   * Convert HTML content to Markdown
   */
  convertToMarkdown(html: string, options?: ConversionOptions): string;
  convertToMarkdown(html: string, pageId?: string): string;
  convertToMarkdown(html: string, optionsOrPageId?: ConversionOptions | string): string {
    // Handle backward compatibility
    let options: ConversionOptions;
    if (typeof optionsOrPageId === 'string') {
      options = { pageId: optionsOrPageId };
    } else {
      options = optionsOrPageId || {};
    }

    // Pre-process HTML to handle Confluence-specific elements
    const processedHtml = this.preprocessConfluenceHtml(html, options.pageId);
    
    // Choose the appropriate conversion service
    const service = options.preserveHtmlTables ? this.htmlTableTurndownService : this.turndownService;
    return service.turndown(processedHtml);
  }

  /**
   * Pre-process HTML to handle Confluence-specific elements that TurndownService can't handle natively
   */
  private preprocessConfluenceHtml(html: string, pageId?: string): string {
    let processedHtml = html;
    
    console.log('Debug: Starting HTML preprocessing...');
    
    // Handle Confluence table macros first
    processedHtml = this.preprocessConfluenceTables(processedHtml);
    
    // Handle Confluence code macros
    processedHtml = processedHtml.replace(
      /<ac:structured-macro\s+ac:name="(code|noformat)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
      (match, macroName, content) => {
        console.log(`Debug: Found ${macroName} macro:`, match.substring(0, 200) + '...');
        
        // Extract language parameter
        const languageMatch = content.match(/<ac:parameter\s+ac:name="language"[^>]*>(.*?)<\/ac:parameter>/i);
        const language = languageMatch ? languageMatch[1].trim() : '';
        
        // Extract code content from CDATA
        const cdataMatch = content.match(/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i);
        const codeContent = cdataMatch ? cdataMatch[1].trim() : '';
        
        console.log(`Debug: Extracted language: "${language}"`);
        console.log(`Debug: Extracted code (first 100 chars): "${codeContent.substring(0, 100)}..."`);
        
        if (codeContent) {
          // Convert to a standard pre/code block that TurndownService can handle
          return `<pre><code class="language-${language}">${this.escapeHtml(codeContent)}</code></pre>`;
        } else {
          console.log('Debug: No code content found, returning comment');
          return `<!-- Confluence ${macroName} macro (content not extracted) -->\n`;
        }
      }
    );
    
    // Handle Confluence image elements
    processedHtml = processedHtml.replace(
      /<ac:image[^>]*>([\s\S]*?)<\/ac:image>/gi,
      (match, content) => {
        console.log(`Debug: Found ac:image element:`, match.substring(0, 200) + '...');
        
        // Extract width/height attributes from ac:image
        const widthMatch = match.match(/ac:width="([^"]+)"/i);
        const heightMatch = match.match(/ac:height="([^"]+)"/i);
        const width = widthMatch ? widthMatch[1] : '';
        const height = heightMatch ? heightMatch[1] : '';
        
        // Extract attachment filename
        const attachmentMatch = content.match(/<ri:attachment\s+ri:filename="([^"]+)"/i);
        if (attachmentMatch) {
          const filename = attachmentMatch[1];
          console.log(`Debug: Extracted attachment filename: "${filename}"`);
          
          // Create a standard img tag that our image processing can handle
          // Use the page ID to build the download URL, encoding the filename for URLs
          const encodedFilename = encodeURIComponent(filename);
          const downloadUrl = pageId 
            ? `/download/attachments/${pageId}/${encodedFilename}`
            : `/download/attachments/PAGE_ID/${encodedFilename}`;
          let imgTag = `<img src="${downloadUrl}" alt="${filename}"`;
          
          if (width) imgTag += ` width="${width}"`;
          if (height) imgTag += ` height="${height}"`;
          imgTag += ` />`;
          
          console.log(`Debug: Converted to img tag: ${imgTag}`);
          console.log(`Debug: Encoded filename "${filename}" -> "${encodedFilename}"`);
          return `\n${imgTag}\n`;
        }
        
        // If we can't extract the attachment, return a comment
        console.log('Debug: Could not extract attachment filename');
        return `<!-- Confluence Image (could not extract attachment) -->\n`;
      }
    );
    
    // Handle other Confluence macros
    processedHtml = processedHtml.replace(
      /<ac:structured-macro\s+ac:name="([^"]+)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
      (match, macroName, content) => {
        console.log(`Debug: Found ${macroName} macro`);
        
        // For info, warning, note macros, extract the content
        if (['info', 'warning', 'note', 'tip'].includes(macroName.toLowerCase())) {
          const richTextMatch = content.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/i);
          if (richTextMatch) {
            const innerContent = richTextMatch[1];
            return `<div class="confluence-macro-${macroName.toLowerCase()}">${innerContent}</div>`;
          }
        }
        
        // Default handling for other macros
        return `<!-- Confluence Macro: ${macroName} -->${content}<!-- End ${macroName} -->`;
      }
    );
    
    console.log('Debug: HTML preprocessing completed');
    return processedHtml;
  }

  /**
   * Escape HTML characters
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Convert a Confluence page to Markdown and save to file
   */
  async convertPageToFile(
    page: ConfluencePage, 
    outputDir: string, 
    confluenceBaseUrl?: string, 
    options?: ConversionOptions
  ): Promise<string> {
    let markdown = this.convertToMarkdown(page.body.storage.value, {
      pageId: page.id,
      preserveHtmlTables: options?.preserveHtmlTables
    });
    
    // Convert relative image URLs to absolute if base URL is provided
    if (confluenceBaseUrl) {
      markdown = this.convertImageUrls(markdown, confluenceBaseUrl);
    }
    
    // Create a safe filename from the page title
    const safeTitle = this.sanitizeFilename(page.title);
    const filename = `${safeTitle}.md`;
    const filePath = path.join(outputDir, filename);

    // Create the output directory if it doesn't exist
    await fs.mkdir(outputDir, { recursive: true });

    // Add metadata header
    const metadata = this.createMetadataHeader(page);
    const fullContent = `${metadata}\n\n${markdown}`;

    // Write the file
    await fs.writeFile(filePath, fullContent, 'utf-8');

    return filePath;
  }

  /**
   * Create metadata header for the markdown file
   */
  private createMetadataHeader(page: ConfluencePage): string {
    const metadata = [
      '---',
      `title: "${page.title}"`,
      `id: "${page.id}"`,
      `confluence_url: "${page._links.webui}"`,
      `created: "${new Date().toISOString()}"`,
      '---',
    ];
    return metadata.join('\n');
  }

  /**
   * Sanitize filename to remove invalid characters
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, '') // Remove leading/trailing underscores
      .substring(0, 200); // Limit length
  }

  /**
   * Sanitize image filename while preserving extension
   */
  private sanitizeImageFilename(filename: string): string {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1) {
      // No extension found, sanitize the whole filename
      return this.sanitizeFilename(filename);
    }
    
    const name = filename.substring(0, lastDotIndex);
    const extension = filename.substring(lastDotIndex);
    
    const sanitizedName = name
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/_+/g, '_') // Replace multiple underscores with single
      .replace(/^_|_$/g, ''); // Remove leading/trailing underscores
    
    return (sanitizedName + extension).substring(0, 200); // Limit total length
  }

  /**
   * Test conversion with custom options
   */
  testConversion(html: string, options?: {
    headingStyle?: 'atx' | 'setext';
    bulletListMarker?: '-' | '*' | '+';
    codeBlockStyle?: 'indented' | 'fenced';
    fence?: '```' | '~~~';
  }): string {
    // Create a temporary converter with custom options
    const tempConverter = new TurndownService({
      headingStyle: options?.headingStyle || 'atx',
      hr: '---',
      bulletListMarker: options?.bulletListMarker || '-',
      codeBlockStyle: options?.codeBlockStyle || 'fenced',
      fence: options?.fence || '```',
    });

    // Apply the same custom rules
    this.applyCustomRules(tempConverter, options?.fence || '```');
    
    return tempConverter.turndown(html);
  }

  /**
   * Apply custom rules to a TurndownService instance
   */
  private applyCustomRules(service: TurndownService, fence: string = '```'): void {
    // Handle Confluence code macros specifically
    service.addRule('confluenceCode', {
      filter: (node: any) => {
        // Check for structured macros with case-insensitive matching
        const nodeName = node.nodeName || node.tagName;
        if (nodeName && nodeName.toUpperCase() === 'AC:STRUCTURED-MACRO') {
          const macroName = node.getAttribute('ac:name');
          return macroName === 'code' || macroName === 'noformat';
        }
        return false;
      },
      replacement: (content: any, node: any) => {
        const macroName = node.getAttribute('ac:name');
        
        console.log(`Debug: Processing ${macroName} macro`);
        console.log(`Debug: Node HTML:`, node.outerHTML?.substring(0, 200) || 'No outerHTML');
        
        // Look for the actual code content in ac:plain-text-body
        let plainTextBody = node.querySelector('ac\\:plain-text-body');
        if (!plainTextBody) {
          // Try without escaping
          plainTextBody = node.querySelector('ac:plain-text-body');
        }
        
        // Look for language parameter
        let languageParam = node.querySelector('ac\\:parameter[ac\\:name="language"]');
        if (!languageParam) {
          languageParam = node.querySelector('ac:parameter[ac\\:name="language"]');
        }
        
        let codeContent = '';
        let language = '';
        
        if (plainTextBody) {
          codeContent = plainTextBody.textContent || plainTextBody.innerHTML || '';
          console.log(`Debug: Found plain-text-body with content: "${codeContent.substring(0, 100)}..."`);
          // Clean up CDATA sections
          codeContent = codeContent.replace(/^\s*<!\[CDATA\[/, '').replace(/\]\]>\s*$/, '').trim();
        } else {
          console.log(`Debug: No plain-text-body found, searching in node content`);
          // Try to extract content from the entire node
          const nodeHTML = node.innerHTML || '';
          const cdataMatch = nodeHTML.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
          if (cdataMatch) {
            codeContent = cdataMatch[1].trim();
            console.log(`Debug: Extracted CDATA content: "${codeContent.substring(0, 100)}..."`);
          } else {
            console.log(`Debug: No CDATA found, using fallback content`);
            codeContent = content.replace(/jsontrue/g, '').replace(/^\s+|\s+$/g, '');
          }
        }
        
        if (languageParam) {
          language = languageParam.textContent || languageParam.innerHTML || '';
          console.log(`Debug: Found language: "${language}"`);
        }
        
        if (codeContent && codeContent.length > 0) {
          const result = `\n${fence}${language}\n${codeContent}\n${fence}\n`;
          console.log(`Debug: Generated code block: "${result.substring(0, 100)}..."`);
          return result;
        } else {
          console.log(`Debug: No code content found, returning fallback`);
          return `\n<!-- Confluence ${macroName} macro (content not found) -->\n${content}\n`;
        }
      },
    });

    // Handle general Confluence macros
    service.addRule('confluenceMacro', {
      filter: (node: any) => {
        return node.nodeName === 'AC:STRUCTURED-MACRO' || 
               (node as any).classList?.contains('confluence-macro');
      },
      replacement: (content: any, node: any) => {
        const macroName = (node as any).getAttribute('ac:name') || 'unknown';
        
        // Skip if already handled by specific rules
        if (macroName === 'code' || macroName === 'noformat') {
          return content; // Let the specific rule handle it
        }
        
        return `\n<!-- Confluence Macro: ${macroName} -->\n${content}\n`;
      },
    });

    // Handle Confluence tables better with proper markdown table format
    service.addRule('confluenceTable', {
      filter: ['table'],
      replacement: (content: any, node: any) => {
        return '\n\n' + content + '\n\n';
      },
    });

    // Handle table headers
    service.addRule('tableHeader', {
      filter: ['th'],
      replacement: (content: any, node: any) => {
        return content.trim() + ' |';
      },
    });

    // Handle table cells
    service.addRule('tableCell', {
      filter: ['td'],
      replacement: (content: any, node: any) => {
        return content.trim() + ' |';
      },
    });

    // Handle table rows
    service.addRule('tableRow', {
      filter: ['tr'],
      replacement: (content: any, node: any) => {
        // Build proper row with spaces around pipes
        const cells = Array.from(node.children || []).map((child: any) => {
          const cellContent = child.textContent || child.innerText || '';
          const trimmed = cellContent.trim();
          
          // Check for styling information
          const style = child.getAttribute('style') || '';
          const bgColorMatch = style.match(/background-color:\s*([^;]+)/i);
          let cellText = trimmed || ' ';
          
          // Add simplified styling information
          if (bgColorMatch) {
            const bgColor = bgColorMatch[1].trim();
            // Convert RGB colors to more readable format
            const rgbMatch = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
              const [, r, g, b] = rgbMatch;
              // Determine color meaning based on common Confluence status colors
              let colorName = this.getColorName(parseInt(r), parseInt(g), parseInt(b));
              if (colorName) {
                cellText = `${cellText} {.${colorName}}`;
              } else {
                cellText = `${cellText} {.color-${r}-${g}-${b}}`;
              }
            } else {
              // Handle named colors or hex colors
              cellText = `${cellText} {.bg-${bgColor.replace(/[^a-zA-Z0-9]/g, '-')}}`;
            }
          }
          
          return cellText;
        });
        
        const row = '| ' + cells.join(' | ') + ' |';
        
        // Check if this is the FIRST row that contains th elements (true header row)
        const isHeaderRow = Array.from(node.children || []).some((child: any) => 
          child.nodeName?.toLowerCase() === 'th'
        );
        
        // Only add separator for the first header row (check if this is the first row in the table)
        const isFirstRow = node.parentElement?.firstElementChild === node ||
                          node.parentElement?.parentElement?.firstElementChild?.firstElementChild === node;
        
        if (isHeaderRow && isFirstRow) {
          // Create separator with proper spacing
          const separator = '\n| ' + Array(cells.length).fill('---').join(' | ') + ' |';
          return row + separator + '\n';
        }
        
        return row + '\n';
      },
    });

    // Handle table body and table head (remove extra spacing)
    service.addRule('tableSection', {
      filter: ['tbody', 'thead', 'tfoot'],
      replacement: (content: any) => {
        return content;
      },
    });

    // Handle code blocks with language (using custom fence)
    service.addRule('codeBlock', {
      filter: (node: any) => {
        return node.nodeName === 'PRE' && node.firstChild?.nodeName === 'CODE';
      },
      replacement: (content: any, node: any) => {
        const codeNode = node.firstChild as any;
        const language = codeNode.className?.replace('language-', '') || '';
        return `\n${fence}${language}\n${content}\n${fence}\n`;
      },
    });

    // Handle Confluence images and attachments
    service.addRule('confluenceImage', {
      filter: ['img'],
      replacement: (content: any, node: any) => {
        const alt = node.getAttribute('alt') || '';
        const src = node.getAttribute('src') || '';
        const title = node.getAttribute('title') ? ` "${node.getAttribute('title')}"` : '';
        
        // Check if it's a Confluence attachment
        if (src.includes('/download/attachments/') || src.includes('/download/thumbnails/')) {
          const filename = this.extractFilenameFromConfluenceUrl(src);
          return `\n![${alt}](${src}${title})\n<!-- Confluence Attachment: ${filename} -->\n`;
        }
        
        // Check for Confluence image macro attributes
        const width = node.getAttribute('width');
        const height = node.getAttribute('height');
        const border = node.getAttribute('border');
        
        let imageMarkdown = `\n![${alt}](${src}${title})`;
        
        // Add HTML attributes as comment if they exist
        if (width || height || border) {
          const attrs = [];
          if (width) attrs.push(`width="${width}"`);
          if (height) attrs.push(`height="${height}"`);
          if (border) attrs.push(`border="${border}"`);
          imageMarkdown += `\n<!-- Image attributes: ${attrs.join(', ')} -->\n`;
        } else {
          imageMarkdown += `\n`;
        }
        
        return imageMarkdown;
      },
    });

    // Handle Confluence gallery macro
    service.addRule('confluenceGallery', {
      filter: (node: any) => {
        return (node as any).classList?.contains('confluence-gallery') ||
               (node as any).getAttribute('ac:name') === 'gallery';
      },
      replacement: (content: any, node: any) => {
        return `\n<!-- Confluence Gallery -->\n${content}\n<!-- End Gallery -->\n`;
      },
    });
  }

  /**
   * Extract filename from Confluence attachment URL
   */
  private extractFilenameFromConfluenceUrl(url: string): string {
    // Extract filename from URLs like:
    // /download/attachments/123456/image.png
    // /download/thumbnails/123456/image.png?version=1&modificationDate=...
    const match = url.match(/\/download\/(?:attachments|thumbnails)\/\d+\/([^?]+)/);
    return match ? decodeURIComponent(match[1]) : 'unknown';
  }

  /**
   * Convert Confluence attachment URLs to absolute URLs if needed
   */
  convertImageUrls(markdown: string, confluenceBaseUrl: string): string {
    return markdown.replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, url) => {
        // Convert relative Confluence URLs to absolute
        if (url.startsWith('/download/')) {
          return `![${alt}](${confluenceBaseUrl}${url})`;
        }
        return match;
      }
    );
  }

  /**
   * Download images from Confluence and update markdown links
   */
  async downloadAndUpdateImages(
    markdown: string, 
    imageDir: string, 
    confluenceBaseUrl: string,
    authHeader: string
  ): Promise<string> {
    const axios = (await import('axios')).default;
    const https = (await import('https')).default;
    
    // Create images directory
    await fs.mkdir(imageDir, { recursive: true });
    console.log(`📁 Created/verified images directory: ${imageDir}`);
    
    // Fixed regex to properly parse image URLs and ignore title attributes
    const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    let updatedMarkdown = markdown;
    let match;
    let downloadCount = 0;
    
    console.log(`🔍 Searching for images in markdown...`);
    console.log(`📝 Markdown length: ${markdown.length} characters`);
    
    // First, let's see what images we find
    const allMatches = [];
    // Use a fresh regex for this scan to avoid lastIndex issues
    const scanRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
    while ((match = scanRegex.exec(markdown)) !== null) {
      allMatches.push(match);
    }
    console.log(`🖼️  Found ${allMatches.length} image references total`);
    
    // Reset regex
    imageRegex.lastIndex = 0;
    
    while ((match = imageRegex.exec(markdown)) !== null) {
      const [fullMatch, alt, url] = match;
      
      console.log(`\n  📷 Processing image:`);
      console.log(`    Alt text: "${alt}"`);
      console.log(`    URL: "${url}"`);
      
      // Skip if it's already a local file or external URL starting with http
      if (url.startsWith('./') || url.startsWith('../')) {
        console.log(`  ⏭️  Skipping local relative image: ${url}`);
        continue;
      }
      
      if (url.startsWith('http') && !url.includes(confluenceBaseUrl)) {
        console.log(`  ⏭️  Skipping external image (not from Confluence): ${url}`);
        continue;
      }
      
      // Check if it's a Confluence attachment/download URL
      if (!url.includes('/download/')) {
        console.log(`  ⏭️  Skipping non-attachment image: ${url}`);
        continue;
      }
      
      try {
        const fullUrl = url.startsWith('http') ? url : `${confluenceBaseUrl}${url}`;
        const originalFilename = this.extractFilenameFromConfluenceUrl(url);
        // Sanitize filename for local storage (replace spaces and special chars)
        const sanitizedFilename = this.sanitizeImageFilename(originalFilename);
        const localPath = path.join(imageDir, sanitizedFilename);
        const relativePath = './images/' + sanitizedFilename;
        
        console.log(`  📥 Preparing to download:`);
        console.log(`    Full URL: ${fullUrl}`);
        console.log(`    Original filename: ${originalFilename}`);
        console.log(`    Sanitized filename: ${sanitizedFilename}`);
        console.log(`    Local path: ${localPath}`);
        console.log(`    Relative path: ${relativePath}`);
        
        // Download the image
        const response = await axios.get(fullUrl, {
          responseType: 'arraybuffer',
          headers: {
            'Authorization': authHeader
          },
          // Add SSL ignore if needed
          httpsAgent: new https.Agent({ rejectUnauthorized: false }),
          timeout: 30000, // 30 second timeout
          maxRedirects: 5
        });
        
        console.log(`  📊 Response received:`);
        console.log(`    Status: ${response.status}`);
        console.log(`    Content-Type: ${response.headers['content-type']}`);
        console.log(`    Content-Length: ${response.headers['content-length']}`);
        console.log(`    Data size: ${response.data.byteLength} bytes`);
        
        await fs.writeFile(localPath, Buffer.from(response.data));
        console.log(`  ✅ Downloaded and saved: ${sanitizedFilename}`);
        
        // Verify file was written
        const stats = await fs.stat(localPath);
        console.log(`  📁 File verification: ${stats.size} bytes on disk`);
        
        // Update markdown to use local path with sanitized filename
        updatedMarkdown = updatedMarkdown.replace(fullMatch, `![${alt}](${relativePath})`);
        downloadCount++;
        console.log(`  🔄 Updated markdown link to: ![${alt}](${relativePath})`);
        
      } catch (error: any) {
        console.error(`  ❌ Failed to download image ${url}:`);
        console.error(`    Error: ${error.message}`);
        if (error.response) {
          console.error(`    HTTP Status: ${error.response.status}`);
          console.error(`    Status Text: ${error.response.statusText}`);
          console.error(`    Response Headers:`, error.response.headers);
        }
        if (error.code) {
          console.error(`    Error Code: ${error.code}`);
        }
      }
    }
    
    console.log(`\n📊 Image download summary:`);
    console.log(`  Total images found: ${allMatches.length}`);
    console.log(`  Images downloaded: ${downloadCount}`);
    console.log(`  Images directory: ${imageDir}`);
    
    // List files in the images directory
    try {
      const files = await fs.readdir(imageDir);
      console.log(`  Files in directory: ${files.length}`);
      files.forEach(file => console.log(`    - ${file}`));
    } catch (error) {
      console.log(`  Could not list directory contents: ${error}`);
    }
    
    return updatedMarkdown;
  }

  /**
   * Process images for Wiki.js upload and update markdown
   */
  async processImagesForWikiJs(
    markdown: string,
    imagesDir: string,
    confluenceBaseUrl: string,
    authHeader: string,
    wikiJsClient: any, // WikiJsClient
    uploadPath: string = '/uploads'
  ): Promise<{ markdown: string; uploadedAssets: any[] }> {
    const axios = (await import('axios')).default;
    
    // Create images directory
    await fs.mkdir(imagesDir, { recursive: true });
    
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let updatedMarkdown = markdown;
    let match;
    const uploadedAssets: any[] = [];
    
    while ((match = imageRegex.exec(markdown)) !== null) {
      const [fullMatch, alt, url] = match;
      
      // Skip if it's already a local file or external URL (non-Confluence)
      if (!url.includes('/download/') || (url.startsWith('http') && !url.includes(confluenceBaseUrl))) {
        continue;
      }
      
      try {
        const fullUrl = url.startsWith('http') ? url : `${confluenceBaseUrl}${url}`;
        const originalFilename = this.extractFilenameFromConfluenceUrl(url);
        const sanitizedFilename = this.sanitizeImageFilename(originalFilename);
        const localPath = path.join(imagesDir, sanitizedFilename);
        
        console.log(`  📥 Downloading for Wiki.js: ${originalFilename} -> ${sanitizedFilename}`);
        
        // Download the image
        const response = await axios.get(fullUrl, {
          responseType: 'arraybuffer',
          headers: {
            'Authorization': authHeader
          }
        });
        
        await fs.writeFile(localPath, Buffer.from(response.data));
        
        // Upload to Wiki.js
        console.log(`  ⬆️  Uploading to Wiki.js: ${sanitizedFilename}`);
        const asset = await wikiJsClient.uploadAsset(localPath, uploadPath);
        uploadedAssets.push(asset);
        
        // Update markdown to use Wiki.js asset path
        const wikiJsImagePath = `${uploadPath}/${asset.filename || sanitizedFilename}`;
        updatedMarkdown = updatedMarkdown.replace(fullMatch, `![${alt}](${wikiJsImagePath})`);
        
        // Clean up local file
        await fs.unlink(localPath);
        
      } catch (error) {
        console.warn(`  ⚠️  Failed to process image ${url}: ${error}`);
      }
    }
    
    return { markdown: updatedMarkdown, uploadedAssets };
  }

  /**
   * Convert Confluence markdown to Wiki.js compatible format
   */
  convertToWikiJsMarkdown(markdown: string): string {
    let wikiJsMarkdown = markdown;
    
    // Remove Confluence-specific metadata comments
    wikiJsMarkdown = wikiJsMarkdown.replace(/<!-- Confluence [^>]+ -->\n?/g, '');
    
    // Convert Confluence macro comments to Wiki.js info boxes
    wikiJsMarkdown = wikiJsMarkdown.replace(
      /<!-- Confluence Macro: (\w+) -->\n(.*?)\n<!-- End \w+ -->/gs,
      (match, macroName, content) => {
        switch (macroName.toLowerCase()) {
          case 'info':
            return `> **Info**\n> ${content.replace(/\n/g, '\n> ')}\n`;
          case 'warning':
            return `> **Warning**\n> ${content.replace(/\n/g, '\n> ')}\n`;
          case 'note':
            return `> **Note**\n> ${content.replace(/\n/g, '\n> ')}\n`;
          default:
            return `> **${macroName}**\n> ${content.replace(/\n/g, '\n> ')}\n`;
        }
      }
    );
    
    // Clean up any remaining Confluence comments
    wikiJsMarkdown = wikiJsMarkdown.replace(/<!-- [^>]+ -->\n?/g, '');
    
    // Ensure proper spacing
    wikiJsMarkdown = wikiJsMarkdown.replace(/\n{3,}/g, '\n\n');
    
    return wikiJsMarkdown.trim();
  }

  /**
   * Enable debug mode to save raw HTML and intermediate conversions
   */
  async convertPageToFileWithDebug(
    page: ConfluencePage, 
    outputDir: string, 
    confluenceBaseUrl?: string, 
    options?: ConversionOptions
  ): Promise<string> {
    const debugDir = path.join(outputDir, 'debug');
    await fs.mkdir(debugDir, { recursive: true });
    
    // Save raw HTML for debugging
    const htmlFile = path.join(debugDir, `${this.sanitizeFilename(page.title)}_raw.html`);
    await fs.writeFile(htmlFile, page.body.storage.value, 'utf-8');
    console.log(`🐛 Debug: Raw HTML saved to ${htmlFile}`);
    
    // Convert and save markdown
    const result = await this.convertPageToFile(page, outputDir, confluenceBaseUrl, options);
    
    return result;
  }

  /**
   * Preprocess Confluence table structures
   */
  private preprocessConfluenceTables(html: string): string {
    let processedHtml = html;
    
    // Handle Confluence table macros
    processedHtml = processedHtml.replace(
      /<ac:structured-macro\s+ac:name="table"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
      (match, content) => {
        console.log('Debug: Found table macro:', match.substring(0, 200) + '...');
        
        // Extract the rich text body content
        const richTextMatch = content.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/i);
        if (richTextMatch) {
          const tableContent = richTextMatch[1];
          return tableContent; // Return the table HTML directly
        }
        
        return match; // Return original if we can't parse it
      }
    );
    
    // Handle Confluence table cell classes but preserve styling attributes
    processedHtml = processedHtml.replace(
      /<(th|td)([^>]*?)class="[^"]*confluenceT[hd][^"]*"([^>]*?)>/gi,
      '<$1$2$3>'
    );
    
    // Clean up empty table cells that might cause issues - ensure they have at least a space
    processedHtml = processedHtml.replace(
      /<(th|td)([^>]*?)>\s*<\/\1>/gi,
      '<$1$2> </$1>'
    );
    
    // Ensure table structure is clean - remove empty tables
    processedHtml = processedHtml.replace(
      /<table([^>]*?)>\s*<tbody>\s*<\/tbody>\s*<\/table>/gi,
      ''
    );
    
    // Clean up extra whitespace in table cells while preserving style attributes
    processedHtml = processedHtml.replace(
      /<(th|td)([^>]*?)>\s*([^<]*?)\s*<\/\1>/gi,
      '<$1$2>$3</$1>'
    );
    
    return processedHtml;
  }

  /**
   * Test table conversion with sample HTML
   */
  testTableConversion(): string {
    const sampleTableHtml = `
      <table>
        <thead>
          <tr>
            <th>Header 1</th>
            <th>Header 2</th>
            <th>Header 3</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Cell 1</td>
            <td>Cell 2</td>
            <td>Cell 3</td>
          </tr>
          <tr>
            <td>Cell 4</td>
            <td>Cell 5</td>
            <td>Cell 6</td>
          </tr>
        </tbody>
      </table>
    `;
    
    console.log('Testing table conversion...');
    console.log('Input HTML:', sampleTableHtml);
    
    const markdown = this.convertToMarkdown(sampleTableHtml);
    console.log('Output Markdown:', markdown);
    
    return markdown;
  }

  /**
   * Convert RGB values to meaningful color names based on common Confluence status colors
   */
  private getColorName(r: number, g: number, b: number): string | null {
    // Common Confluence status colors
    if (r >= 220 && g >= 240 && b >= 200) return 'success'; // Light green
    if (r >= 250 && g >= 240 && b >= 160) return 'warning'; // Light yellow
    if (r >= 250 && g >= 230 && b >= 220) return 'error';   // Light red/pink
    if (r >= 240 && g >= 240 && b >= 240) return 'neutral'; // Light gray
    if (r >= 220 && g >= 240 && b >= 250) return 'info';    // Light blue
    
    return null; // Unknown color pattern
  }

  private applyHtmlTableRules(service: TurndownService): void {
    // Override table rules to preserve HTML tables instead of converting to markdown
    service.addRule('preserveHtmlTable', {
      filter: ['table'],
      replacement: (content: any, node: any) => {
        // Clean up the HTML table while preserving styling
        const tableHtml = this.cleanTableHtml(node.outerHTML);
        return `\n\n${tableHtml}\n\n`;
      },
    });

    // Remove individual table element rules so they don't interfere
    service.remove(['th', 'td', 'tr', 'thead', 'tbody', 'tfoot']);
  }

  private cleanTableHtml(tableHtml: string): string {
    let cleanHtml = tableHtml;
    
    // Remove only Confluence-specific classes but preserve all other attributes including style
    cleanHtml = cleanHtml.replace(/\s*class="[^"]*confluenceT[hd][^"]*"/gi, '');
    cleanHtml = cleanHtml.replace(/\s*class="[^"]*confluenceTable[^"]*"/gi, '');
    
    // Be more careful with class removal - only remove confluence classes, keep others
    cleanHtml = cleanHtml.replace(/class="([^"]*)"/gi, (match, classes) => {
      const filteredClasses = classes
        .split(/\s+/)
        .filter((cls: string) => !cls.toLowerCase().includes('confluence'))
        .join(' ');
      return filteredClasses ? `class="${filteredClasses}"` : '';
    });
    
    // Format the HTML nicely with proper indentation while preserving content
    cleanHtml = cleanHtml.replace(/>\s*</g, '>\n<');
    cleanHtml = cleanHtml.replace(/<table([^>]*)>/gi, match => `${match}\n`);
    cleanHtml = cleanHtml.replace(/<\/table>/gi, '\n</table>');
    cleanHtml = cleanHtml.replace(/<(tbody|thead|tfoot)([^>]*)>/gi, match => `${match}\n`);
    cleanHtml = cleanHtml.replace(/<\/(tbody|thead|tfoot)>/gi, match => `\n${match}`);
    cleanHtml = cleanHtml.replace(/<tr([^>]*)>/gi, match => `  ${match}\n`);
    cleanHtml = cleanHtml.replace(/<\/tr>/gi, '\n  </tr>');
    cleanHtml = cleanHtml.replace(/<(th|td)([^>]*)>/gi, match => `    ${match}`);
    cleanHtml = cleanHtml.replace(/<\/(th|td)>/gi, match => `${match}\n`);
    
    // Clean up excessive whitespace but preserve structure
    cleanHtml = cleanHtml.replace(/\n\s*\n/g, '\n');
    cleanHtml = cleanHtml.trim();
    
    // Only add basic styling if NO styles exist at all (neither inline nor in style attribute)
    const hasInlineStyles = cleanHtml.includes('style=');
    const hasStyleTags = cleanHtml.includes('<style>');
    
    if (!hasInlineStyles && !hasStyleTags) {
      // Add basic table styling
      cleanHtml = cleanHtml.replace(/<table([^>]*)>/i, (match, attrs) => {
        if (!attrs.includes('style=')) {
          return `<table${attrs} style="border-collapse: collapse; width: 100%;">`;
        }
        return match;
      });
      
      // Add basic cell styling only to cells without existing styles
      cleanHtml = cleanHtml.replace(/<(th|td)([^>]*?)>/gi, (match, tag, attrs) => {
        if (!attrs.includes('style=')) {
          const defaultStyle = tag === 'th' 
            ? 'border: 1px solid #ddd; padding: 8px; background-color: #f5f5f5; font-weight: bold;'
            : 'border: 1px solid #ddd; padding: 8px;';
          return `<${tag}${attrs} style="${defaultStyle}">`;
        }
        return match;
      });
    }
    
    return cleanHtml;
  }
}
