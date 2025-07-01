import TurndownService from 'turndown';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfluencePage } from './types';

export class MarkdownConverter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      fence: '```',
    });

    // Add custom rules for Confluence-specific elements
    this.setupCustomRules();
  }

  private setupCustomRules(): void {
    this.applyCustomRules(this.turndownService, '```');
  }

  /**
   * Convert HTML content to Markdown
   */
  convertToMarkdown(html: string): string {
    return this.turndownService.turndown(html);
  }

  /**
   * Convert a Confluence page to Markdown and save to file
   */
  async convertPageToFile(page: ConfluencePage, outputDir: string, confluenceBaseUrl?: string): Promise<string> {
    let markdown = this.convertToMarkdown(page.body.storage.value);
    
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
    // Handle Confluence macros
    service.addRule('confluenceMacro', {
      filter: (node: any) => {
        return node.nodeName === 'AC:STRUCTURED-MACRO' || 
               (node as any).classList?.contains('confluence-macro');
      },
      replacement: (content: any, node: any) => {
        const macroName = (node as any).getAttribute('ac:name') || 'unknown';
        return `\n<!-- Confluence Macro: ${macroName} -->\n${content}\n`;
      },
    });

    // Handle Confluence tables better
    service.addRule('confluenceTable', {
      filter: ['table'],
      replacement: (content: any, node: any) => {
        return '\n\n' + content + '\n\n';
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
          return `![${alt}](${src}${title})\n<!-- Confluence Attachment: ${filename} -->`;
        }
        
        // Check for Confluence image macro attributes
        const width = node.getAttribute('width');
        const height = node.getAttribute('height');
        const border = node.getAttribute('border');
        
        let imageMarkdown = `![${alt}](${src}${title})`;
        
        // Add HTML attributes as comment if they exist
        if (width || height || border) {
          const attrs = [];
          if (width) attrs.push(`width="${width}"`);
          if (height) attrs.push(`height="${height}"`);
          if (border) attrs.push(`border="${border}"`);
          imageMarkdown += `\n<!-- Image attributes: ${attrs.join(', ')} -->`;
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
    
    // Create images directory
    await fs.mkdir(imageDir, { recursive: true });
    
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    let updatedMarkdown = markdown;
    let match;
    
    while ((match = imageRegex.exec(markdown)) !== null) {
      const [fullMatch, alt, url] = match;
      
      // Skip if it's already a local file or external URL
      if (!url.includes('/download/') || url.startsWith('http')) {
        continue;
      }
      
      try {
        const fullUrl = url.startsWith('http') ? url : `${confluenceBaseUrl}${url}`;
        const filename = this.extractFilenameFromConfluenceUrl(url);
        const localPath = path.join(imageDir, filename);
        const relativePath = path.relative(path.dirname(imageDir), localPath);
        
        console.log(`  📥 Downloading image: ${filename}`);
        
        // Download the image
        const response = await axios.get(fullUrl, {
          responseType: 'arraybuffer',
          headers: {
            'Authorization': authHeader
          }
        });
        
        await fs.writeFile(localPath, Buffer.from(response.data));
        
        // Update markdown to use local path
        updatedMarkdown = updatedMarkdown.replace(fullMatch, `![${alt}](${relativePath})`);
        
      } catch (error) {
        console.warn(`  ⚠️  Failed to download image ${url}: ${error}`);
      }
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
        const filename = this.extractFilenameFromConfluenceUrl(url);
        const localPath = path.join(imagesDir, filename);
        
        console.log(`  📥 Downloading for Wiki.js: ${filename}`);
        
        // Download the image
        const response = await axios.get(fullUrl, {
          responseType: 'arraybuffer',
          headers: {
            'Authorization': authHeader
          }
        });
        
        await fs.writeFile(localPath, Buffer.from(response.data));
        
        // Upload to Wiki.js
        console.log(`  ⬆️  Uploading to Wiki.js: ${filename}`);
        const asset = await wikiJsClient.uploadAsset(localPath, uploadPath);
        uploadedAssets.push(asset);
        
        // Update markdown to use Wiki.js asset path
        const wikiJsImagePath = `${uploadPath}/${asset.filename || filename}`;
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
}
