#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, loadWikiJsConfig } from './config';
import { ConfluenceClient } from './confluence-client';
import { MarkdownConverter } from './markdown-converter';
import * as fs from 'fs/promises';
import * as path from 'path';

const program = new Command();

program
  .name('confluence-md-exporter')
  .description('Export Confluence pages to Markdown format')
  .version('1.0.0');

program
  .command('export-space')
  .description('Export all pages from a Confluence space')
  .option('-s, --space <spaceKey>', 'Confluence space key')
  .option('-o, --output <directory>', 'Output directory')
  .option('--download-images', 'Download and save images locally')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const spaceKey = options.space || config.spaceKey;
      const outputDir = options.output || config.outputDir;

      if (!spaceKey) {
        console.error('Error: Space key is required. Use --space option or set SPACE_KEY in .env file');
        process.exit(1);
      }

      console.log(`Exporting pages from space: ${spaceKey}`);
      console.log(`Output directory: ${outputDir}`);

      const client = new ConfluenceClient(config);
      const converter = new MarkdownConverter();

      // Get all pages from the space
      const pages = await client.getAllPagesFromSpace(spaceKey);
      console.log(`Found ${pages.length} pages to export`);

      // Create space-specific output directory
      const spaceOutputDir = path.join(outputDir, spaceKey);
      await fs.mkdir(spaceOutputDir, { recursive: true });

      // Create images directory if downloading images
      const imagesDir = options.downloadImages ? path.join(spaceOutputDir, 'images') : null;
      if (imagesDir) {
        await fs.mkdir(imagesDir, { recursive: true });
        console.log(`📁 Images will be saved to: ${imagesDir}`);
      }

      // Convert each page
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        console.log(`Converting page ${i + 1}/${pages.length}: ${page.title}`);
        
        try {
          const filePath = await converter.convertPageToFile(page, spaceOutputDir, config.baseUrl);
          console.log(`  → Saved to: ${filePath}`);
          
          // Download images if requested
          if (options.downloadImages && imagesDir) {
            console.log(`  📥 Downloading images for: ${page.title}`);
            const markdownContent = await fs.readFile(filePath, 'utf-8');
            const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
            const updatedMarkdown = await converter.downloadAndUpdateImages(
              markdownContent,
              imagesDir,
              config.baseUrl,
              authHeader
            );
            await fs.writeFile(filePath, updatedMarkdown, 'utf-8');
          }
        } catch (error) {
          console.error(`  → Error converting page "${page.title}": ${error}`);
        }
      }

      console.log(`\nExport completed! ${pages.length} pages exported to ${spaceOutputDir}`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('export-page')
  .description('Export a specific page by ID')
  .option('-p, --page <pageId>', 'Confluence page ID')
  .option('-o, --output <directory>', 'Output directory')
  .option('--download-images', 'Download and save images locally')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const pageId = options.page;
      const outputDir = options.output || config.outputDir;

      if (!pageId) {
        console.error('Error: Page ID is required. Use --page option');
        process.exit(1);
      }

      console.log(`Exporting page: ${pageId}`);
      console.log(`Output directory: ${outputDir}`);

      const client = new ConfluenceClient(config);
      const converter = new MarkdownConverter();

      // Get the specific page
      const page = await client.getPage(pageId);
      console.log(`Found page: ${page.title}`);

      // Convert the page
      const filePath = await converter.convertPageToFile(page, outputDir, config.baseUrl);
      console.log(`Saved to: ${filePath}`);
      
      // Download images if requested
      if (options.downloadImages) {
        console.log(`📥 Downloading images for: ${page.title}`);
        const imagesDir = path.join(outputDir, 'images');
        await fs.mkdir(imagesDir, { recursive: true });
        
        const markdownContent = await fs.readFile(filePath, 'utf-8');
        const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
        const updatedMarkdown = await converter.downloadAndUpdateImages(
          markdownContent,
          imagesDir,
          config.baseUrl,
          authHeader
        );
        await fs.writeFile(filePath, updatedMarkdown, 'utf-8');
      }

      console.log('\nExport completed!');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('list-spaces')
  .description('List all available Confluence spaces')
  .action(async () => {
    try {
      const config = loadConfig();
      const client = new ConfluenceClient(config);

      console.log('Fetching spaces...');
      const spaces = await client.getSpaces();

      console.log('\nAvailable spaces:');
      spaces.forEach(space => {
        console.log(`  ${space.key} - ${space.name}`);
      });
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('search')
  .description('Search for pages')
  .option('-q, --query <query>', 'Search query (CQL)')
  .option('-l, --limit <number>', 'Maximum number of results', '10')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const client = new ConfluenceClient(config);
      const query = options.query;
      const limit = parseInt(options.limit);

      if (!query) {
        console.error('Error: Search query is required. Use --query option');
        process.exit(1);
      }

      console.log(`Searching for: ${query}`);
      const results = await client.searchPages(query, limit);

      console.log(`\nFound ${results.results.length} pages:`);
      results.results.forEach(page => {
        console.log(`  ${page.id} - ${page.title}`);
      });
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('convert-html')
  .description('Convert HTML file to Markdown (for testing)')
  .option('-i, --input <htmlFile>', 'Input HTML file path')
  .option('-o, --output <mdFile>', 'Output Markdown file path (optional)')
  .option('-t, --title <title>', 'Page title for metadata (optional)')
  .action(async (options) => {
    try {
      const htmlFile = options.input;
      
      if (!htmlFile) {
        console.error('Error: Input HTML file is required. Use --input option');
        process.exit(1);
      }

      // Check if input file exists
      try {
        await fs.access(htmlFile);
      } catch {
        console.error(`Error: Input file "${htmlFile}" does not exist`);
        process.exit(1);
      }

      console.log(`Converting HTML file: ${htmlFile}`);

      // Read HTML content
      const htmlContent = await fs.readFile(htmlFile, 'utf-8');
      
      const converter = new MarkdownConverter();
      const markdown = converter.convertToMarkdown(htmlContent);

      // Determine output file path
      let outputFile = options.output;
      if (!outputFile) {
        const inputDir = path.dirname(htmlFile);
        const inputName = path.basename(htmlFile, path.extname(htmlFile));
        outputFile = path.join(inputDir, `${inputName}.md`);
      }

      // Add metadata header if title is provided
      let fullContent = markdown;
      if (options.title) {
        const metadata = [
          '---',
          `title: "${options.title}"`,
          `converted_from: "${path.basename(htmlFile)}"`,
          `created: "${new Date().toISOString()}"`,
          '---',
        ].join('\n');
        fullContent = `${metadata}\n\n${markdown}`;
      }

      // Write the converted markdown
      await fs.writeFile(outputFile, fullContent, 'utf-8');
      
      console.log(`✅ Converted successfully!`);
      console.log(`📄 Input:  ${htmlFile}`);
      console.log(`📝 Output: ${outputFile}`);
      console.log(`📊 Size:   ${htmlContent.length} chars → ${fullContent.length} chars`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('convert-advanced')
  .description('Convert HTML to Markdown with advanced options (for testing)')
  .option('-i, --input <htmlFile>', 'Input HTML file path')
  .option('-o, --output <mdFile>', 'Output Markdown file path (optional)')
  .option('-t, --title <title>', 'Page title for metadata (optional)')
  .option('--heading-style <style>', 'Heading style: atx or setext', 'atx')
  .option('--bullet-marker <marker>', 'Bullet list marker: -, *, or +', '-')
  .option('--code-style <style>', 'Code block style: fenced or indented', 'fenced')
  .option('--fence <fence>', 'Code fence style: ``` or ~~~', '```')
  .option('--preview', 'Preview conversion without saving')
  .action(async (options) => {
    try {
      const htmlFile = options.input;
      
      if (!htmlFile) {
        console.error('Error: Input HTML file is required. Use --input option');
        process.exit(1);
      }

      // Check if input file exists
      try {
        await fs.access(htmlFile);
      } catch {
        console.error(`Error: Input file "${htmlFile}" does not exist`);
        process.exit(1);
      }

      console.log(`Converting HTML file: ${htmlFile}`);
      console.log(`Options:`);
      console.log(`  Heading style: ${options.headingStyle}`);
      console.log(`  Bullet marker: ${options.bulletMarker}`);
      console.log(`  Code style: ${options.codeStyle}`);
      console.log(`  Fence: ${options.fence}`);

      // Read HTML content
      const htmlContent = await fs.readFile(htmlFile, 'utf-8');
      
      const converter = new MarkdownConverter();
      const markdown = converter.testConversion(htmlContent, {
        headingStyle: options.headingStyle as 'atx' | 'setext',
        bulletListMarker: options.bulletMarker as '-' | '*' | '+',
        codeBlockStyle: options.codeStyle as 'fenced' | 'indented',
        fence: options.fence as '```' | '~~~',
      });

      // Add metadata header if title is provided
      let fullContent = markdown;
      if (options.title) {
        const metadata = [
          '---',
          `title: "${options.title}"`,
          `converted_from: "${path.basename(htmlFile)}"`,
          `conversion_options:`,
          `  heading_style: "${options.headingStyle}"`,
          `  bullet_marker: "${options.bulletMarker}"`,
          `  code_style: "${options.codeStyle}"`,
          `  fence: "${options.fence}"`,
          `created: "${new Date().toISOString()}"`,
          '---',
        ].join('\n');
        fullContent = `${metadata}\n\n${markdown}`;
      }

      if (options.preview) {
        console.log('\n--- PREVIEW ---');
        console.log(fullContent.substring(0, 1000));
        if (fullContent.length > 1000) {
          console.log(`\n... (truncated, ${fullContent.length - 1000} more characters)`);
        }
        console.log('\n--- END PREVIEW ---');
        return;
      }

      // Determine output file path
      let outputFile = options.output;
      if (!outputFile) {
        const inputDir = path.dirname(htmlFile);
        const inputName = path.basename(htmlFile, path.extname(htmlFile));
        outputFile = path.join(inputDir, `${inputName}_advanced.md`);
      }

      // Write the converted markdown
      await fs.writeFile(outputFile, fullContent, 'utf-8');
      
      console.log(`✅ Converted successfully!`);
      console.log(`📄 Input:  ${htmlFile}`);
      console.log(`📝 Output: ${outputFile}`);
      console.log(`📊 Size:   ${htmlContent.length} chars → ${fullContent.length} chars`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('download-images')
  .description('Download images from exported markdown files')
  .option('-i, --input <mdFile>', 'Input markdown file')
  .option('-d, --images-dir <directory>', 'Directory to save images', './images')
  .option('--update', 'Update the markdown file with local image paths')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const mdFile = options.input;
      const imagesDir = options.imagesDir;
      
      if (!mdFile) {
        console.error('Error: Input markdown file is required. Use --input option');
        process.exit(1);
      }

      // Check if input file exists
      try {
        await fs.access(mdFile);
      } catch {
        console.error(`Error: Input file "${mdFile}" does not exist`);
        process.exit(1);
      }

      console.log(`📥 Downloading images from: ${mdFile}`);
      console.log(`📁 Images directory: ${imagesDir}`);

      // Read markdown content
      const markdownContent = await fs.readFile(mdFile, 'utf-8');
      
      const converter = new MarkdownConverter();
      const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
      
      // Download images and update markdown
      const updatedMarkdown = await converter.downloadAndUpdateImages(
        markdownContent,
        imagesDir,
        config.baseUrl,
        authHeader
      );

      if (options.update) {
        await fs.writeFile(mdFile, updatedMarkdown, 'utf-8');
        console.log(`✅ Updated markdown file with local image paths`);
      } else {
        const outputFile = mdFile.replace(/\.md$/, '_with_images.md');
        await fs.writeFile(outputFile, updatedMarkdown, 'utf-8');
        console.log(`✅ Created new file with local images: ${outputFile}`);
      }
      
      console.log(`📊 Image download completed!`);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('export-to-wikijs')
  .description('Export Confluence space directly to Wiki.js')
  .option('-s, --space <spaceKey>', 'Confluence space key')
  .option('--upload-path <path>', 'Wiki.js upload path for images', '/uploads')
  .option('--page-prefix <prefix>', 'Prefix for Wiki.js page paths')
  .option('--dry-run', 'Preview what would be uploaded without actually doing it')
  .action(async (options) => {
    try {
      const config = loadConfig();
      const wikiJsConfig = loadWikiJsConfig();
      const spaceKey = options.space || config.spaceKey;

      if (!spaceKey) {
        console.error('Error: Space key is required. Use --space option or set SPACE_KEY in .env file');
        process.exit(1);
      }

      console.log(`🚀 Exporting Confluence space "${spaceKey}" to Wiki.js`);
      console.log(`📡 Confluence: ${config.baseUrl}`);
      console.log(`📚 Wiki.js: ${wikiJsConfig.baseUrl}`);
      console.log(`📁 Upload path: ${options.uploadPath}`);

      const confluenceClient = new ConfluenceClient(config);
      const wikiJsClient = new (await import('./wikijs-client')).WikiJsClient(wikiJsConfig);
      const converter = new MarkdownConverter();

      // Get all pages from the space
      const pages = await confluenceClient.getAllPagesFromSpace(spaceKey);
      console.log(`Found ${pages.length} pages to export`);

      // Create temporary images directory
      const tempImagesDir = path.join(process.cwd(), 'temp-images');
      await fs.mkdir(tempImagesDir, { recursive: true });

      const results = [];

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        console.log(`\n📄 Processing page ${i + 1}/${pages.length}: ${page.title}`);
        
        try {
          // Convert to markdown
          let markdown = converter.convertToMarkdown(page.body.storage.value);
          
          // Convert relative image URLs to absolute
          markdown = converter.convertImageUrls(markdown, config.baseUrl);
          
          if (!options.dryRun) {
            // Process images for Wiki.js
            const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
            const { markdown: updatedMarkdown, uploadedAssets } = await converter.processImagesForWikiJs(
              markdown,
              tempImagesDir,
              config.baseUrl,
              authHeader,
              wikiJsClient,
              options.uploadPath
            );
            
            // Convert to Wiki.js compatible markdown
            const wikiJsMarkdown = converter.convertToWikiJsMarkdown(updatedMarkdown);
            
            // Generate Wiki.js page path
            const pagePath = (await import('./wikijs-client')).WikiJsClient.sanitizePagePath(
              page.title, 
              options.pagePrefix || spaceKey
            );
            
            // Check if page already exists
            const existingPage = await wikiJsClient.getPageByPath(pagePath);
            
            const wikiJsPage = {
              path: pagePath,
              title: page.title,
              content: wikiJsMarkdown,
              contentType: 'markdown',
              editor: 'markdown',
              locale: 'en',
              isPublished: true,
              tags: [spaceKey.toLowerCase(), 'confluence-import'],
              description: `Imported from Confluence page ${page.id}`,
            };
            
            let result;
            if (existingPage) {
              console.log(`  ♻️  Updating existing page at /${pagePath}`);
              result = await wikiJsClient.updatePage(existingPage.id!, wikiJsPage);
            } else {
              console.log(`  ✨ Creating new page at /${pagePath}`);
              result = await wikiJsClient.createPage(wikiJsPage);
            }
            
            results.push({
              confluencePage: page,
              wikiJsPage: result,
              uploadedAssets,
              status: 'success'
            });
            
            console.log(`  ✅ Successfully ${existingPage ? 'updated' : 'created'} Wiki.js page`);
            console.log(`  📊 Uploaded ${uploadedAssets.length} images`);
          } else {
            // Dry run - just show what would happen
            const wikiJsMarkdown = converter.convertToWikiJsMarkdown(markdown);
            const pagePath = (await import('./wikijs-client')).WikiJsClient.sanitizePagePath(
              page.title, 
              options.pagePrefix || spaceKey
            );
            
            console.log(`  📋 Would create/update: /${pagePath}`);
            console.log(`  📊 Content length: ${wikiJsMarkdown.length} characters`);
            
            // Count images that would be uploaded
            const imageCount = (markdown.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || []).length;
            console.log(`  🖼️  Would process ${imageCount} images`);
          }
          
        } catch (error) {
          console.error(`  ❌ Error processing page "${page.title}": ${error}`);
          results.push({
            confluencePage: page,
            error: String(error),
            status: 'error'
          });
        }
      }

      // Clean up temp directory
      try {
        await fs.rmdir(tempImagesDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors
      }

      // Summary
      console.log(`\n🎉 Export completed!`);
      const successful = results.filter(r => r.status === 'success').length;
      const failed = results.filter(r => r.status === 'error').length;
      const totalImages = results.reduce((sum, r) => sum + (r.uploadedAssets?.length || 0), 0);
      
      console.log(`✅ Successfully processed: ${successful} pages`);
      if (failed > 0) {
        console.log(`❌ Failed: ${failed} pages`);
      }
      if (!options.dryRun) {
        console.log(`🖼️  Total images uploaded: ${totalImages}`);
      }
      
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program
  .command('convert-to-wikijs')
  .description('Convert exported markdown files to Wiki.js and upload')
  .option('-i, --input <mdFile>', 'Input markdown file or directory')
  .option('-p, --page-path <path>', 'Wiki.js page path (for single file)')
  .option('--upload-images', 'Upload images to Wiki.js')
  .option('--upload-path <path>', 'Wiki.js upload path for images', '/uploads')
  .option('--dry-run', 'Preview without uploading')
  .action(async (options) => {
    try {
      const wikiJsConfig = loadWikiJsConfig();
      const inputPath = options.input;

      if (!inputPath) {
        console.error('Error: Input file or directory is required. Use --input option');
        process.exit(1);
      }

      console.log(`📚 Converting to Wiki.js format`);
      console.log(`📡 Wiki.js: ${wikiJsConfig.baseUrl}`);

      const wikiJsClient = new (await import('./wikijs-client')).WikiJsClient(wikiJsConfig);
      const converter = new MarkdownConverter();

      // Check if input is file or directory
      const stat = await fs.stat(inputPath);
      const filesToProcess = [];

      if (stat.isDirectory()) {
        const files = await fs.readdir(inputPath);
        for (const file of files) {
          if (file.endsWith('.md')) {
            filesToProcess.push(path.join(inputPath, file));
          }
        }
      } else if (inputPath.endsWith('.md')) {
        filesToProcess.push(inputPath);
      } else {
        console.error('Error: Input must be a .md file or directory containing .md files');
        process.exit(1);
      }

      console.log(`Found ${filesToProcess.length} markdown files to process`);

      for (let i = 0; i < filesToProcess.length; i++) {
        const filePath = filesToProcess[i];
        const fileName = path.basename(filePath, '.md');
        
        console.log(`\n📄 Processing ${i + 1}/${filesToProcess.length}: ${fileName}`);

        try {
          // Read markdown content
          const markdownContent = await fs.readFile(filePath, 'utf-8');
          
          // Extract title from metadata or filename
          const titleMatch = markdownContent.match(/^---[\s\S]*?title:\s*["']([^"']+)["'][\s\S]*?---/);
          const title = titleMatch ? titleMatch[1] : fileName;
          
          // Generate page path
          const pagePath = options.pagePath || (await import('./wikijs-client')).WikiJsClient.sanitizePagePath(title);
          
          // Convert to Wiki.js format
          let wikiJsMarkdown = converter.convertToWikiJsMarkdown(markdownContent);
          
          // Upload images if requested
          let uploadedAssets = [];
          if (options.uploadImages && !options.dryRun) {
            console.log(`  🖼️  Processing images...`);
            // This is a simplified version - for full image upload, use the confluence export command
            const imageMatches = wikiJsMarkdown.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
            console.log(`  📊 Found ${imageMatches.length} image references`);
          }
          
          if (!options.dryRun) {
            // Check if page exists
            const existingPage = await wikiJsClient.getPageByPath(pagePath);
            
            const wikiJsPage = {
              path: pagePath,
              title: title,
              content: wikiJsMarkdown,
              contentType: 'markdown',
              editor: 'markdown',
              locale: 'en',
              isPublished: true,
              tags: ['markdown-import'],
              description: `Imported from ${fileName}.md`,
            };
            
            if (existingPage) {
              console.log(`  ♻️  Updating existing page at /${pagePath}`);
              await wikiJsClient.updatePage(existingPage.id!, wikiJsPage);
            } else {
              console.log(`  ✨ Creating new page at /${pagePath}`);
              await wikiJsClient.createPage(wikiJsPage);
            }
            
            console.log(`  ✅ Successfully ${existingPage ? 'updated' : 'created'} Wiki.js page`);
          } else {
            console.log(`  📋 Would create/update: /${pagePath}`);
            console.log(`  📊 Content length: ${wikiJsMarkdown.length} characters`);
          }
          
        } catch (error) {
          console.error(`  ❌ Error processing ${fileName}: ${error}`);
        }
      }

      console.log(`\n🎉 Conversion completed!`);
      
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
