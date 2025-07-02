#!/usr/bin/env node

import { Command } from 'commander';
import { loadConfig, loadWikiJsConfig } from './config';
import { ConfluenceClient } from './confluence-client';
import { MarkdownConverter } from './markdown-converter';
import { WikiJsClient } from './wikijs-client';
import * as fs from 'fs/promises';
import * as path from 'path';

const program = new Command();

program
  .name('confluence-md-exporter')
  .description('Export Confluence pages to Markdown format')
  .version('1.0.0')
  .option('--ignore-ssl', 'Ignore SSL certificate errors (useful for self-signed certificates)');

// Helper function to load config with CLI options
function loadConfigWithOptions(options: any) {
  const config = loadConfig();
  // Override SSL setting if provided via CLI
  if (options.ignoreSsl) {
    config.ignoreSSL = true;
  }
  return config;
}

program
  .command('export-space')
  .description('Export all pages from a Confluence space')
  .option('-s, --space <spaceKey>', 'Confluence space key')
  .option('-o, --output <directory>', 'Output directory')
  .option('--download-images', 'Download and save images locally')
  .option('--html-tables', 'Preserve tables as HTML instead of converting to markdown')
  .option('--preserve-hierarchy', 'Preserve Confluence page hierarchy in output directory structure')
  .action(async (options) => {
    try {
      const config = loadConfigWithOptions(program.opts());
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
          const filePath = await converter.convertPageToFile(page, spaceOutputDir, config.baseUrl, {
            preserveHtmlTables: options.htmlTables
          });
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
              authHeader,
              config // Pass config for SSL ignore setting
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
  .option('--html-tables', 'Preserve tables as HTML instead of converting to markdown')
  .action(async (options, command) => {
    try {
      console.log('=== DEBUG INFO ===');
      console.log('Command options:', JSON.stringify(options, null, 2));
      console.log('Process argv:', process.argv);
      console.log('Command name:', command.name());
      console.log('Parent options:', command.parent?.opts());
      console.log('==================');
      
      // Get global options from parent program
      const globalOpts = command.parent?.opts() || {};
      const config = loadConfigWithOptions(globalOpts);
      const pageId = options.page || process.env.PAGE_ID;
      const outputDir = options.output || config.outputDir;

      if (!pageId) {
        console.error('Error: Page ID is required. Use --page option');
        console.error('');
        console.error('Correct usage:');
        console.error('  npm start export-page --page 123456789');
        console.error('');
        console.error('You provided these arguments:', process.argv.slice(2));
        console.error('Received options:', JSON.stringify(options, null, 2));
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
      const filePath = await converter.convertPageToFile(page, outputDir, config.baseUrl, {
        preserveHtmlTables: options.htmlTables
      });
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
          authHeader,
          config // Pass config for SSL ignore setting
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
      const config = loadConfigWithOptions(program.opts());
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
      const config = loadConfigWithOptions(program.opts());
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
  .option('--html-tables', 'Preserve tables as HTML instead of converting to markdown')
  .option('--debug', 'Enable debug mode with verbose output')
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
      
      if (options.debug) {
        console.log('🐛 Debug mode enabled');
      }

      // Read HTML content
      const htmlContent = await fs.readFile(htmlFile, 'utf-8');
      
      if (options.debug) {
        console.log(`📄 HTML content length: ${htmlContent.length} characters`);
        console.log(`📝 HTML preview (first 300 chars):`);
        console.log(htmlContent.substring(0, 300) + '...');
      }
      
      const converter = new MarkdownConverter();
      const markdown = converter.convertToMarkdown(htmlContent, { 
        preserveHtmlTables: options.htmlTables 
      });

      if (options.debug) {
        console.log(`📝 Markdown content length: ${markdown.length} characters`);
        console.log(`📝 Markdown preview (first 500 chars):`);
        console.log(markdown.substring(0, 500) + '...');
      }

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
      const config = loadConfigWithOptions(program.opts());
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
        authHeader,
        config // Pass config for SSL ignore setting
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
  .option('--namespace <namespace>', 'Wiki.js namespace/locale (e.g., "de" for German, "fr" for French)')
  .option('--html-tables', 'Preserve tables as HTML instead of converting to markdown')
  .option('--preserve-hierarchy', 'Preserve Confluence page hierarchy in Wiki.js paths')
  .option('--create-navigation', 'Create Wiki.js navigation from page hierarchy')
  .option('--upload-images', 'Download images from Confluence and upload to Wiki.js')
  .option('--skip-images', 'Skip image processing entirely (faster but no images)')
  .option('--update', 'Update existing pages (default: true). Use --no-update to skip existing pages')
  .option('--dry-run', 'Preview what would be uploaded without actually doing it')
  .action(async (options) => {
    try {
      const config = loadConfigWithOptions(program.opts());
      const wikiJsConfig = loadWikiJsConfig();
      const spaceKey = options.space || config.spaceKey;

      // Override namespace from CLI option if provided
      const namespace = (options.namespace || wikiJsConfig.namespace).trim();
      
      // Debug: Show namespace value and length
      console.log(`🌐 Namespace debug: value="${namespace}", length=${namespace.length}, has leading space: ${namespace !== namespace.trimStart()}, has trailing space: ${namespace !== namespace.trimEnd()}`);

      if (!spaceKey) {
        console.error('Error: Space key is required. Use --space option or set SPACE_KEY in .env file');
        process.exit(1);
      }

      console.log(`🚀 Exporting Confluence space "${spaceKey}" to Wiki.js`);
      console.log(`📡 Confluence: ${config.baseUrl}`);
      console.log(`📚 Wiki.js: ${wikiJsConfig.baseUrl}`);
      console.log(`📁 Upload path: ${options.uploadPath}`);
      console.log(`🌐 Namespace: ${namespace}`);
      console.log(`🔄 Update mode: ${options.update !== false ? 'Update existing pages' : 'Skip existing pages'}`);
      
      // Show image processing mode
      if (options.uploadImages) {
        console.log(`🖼️  Image mode: Download from Confluence and upload to Wiki.js`);
      } else if (options.skipImages) {
        console.log(`⏭️  Image mode: Skip all images (faster export)`);
      } else {
        console.log(`📋 Image mode: Default (use --upload-images to upload to Wiki.js)`);
      }

      const confluenceClient = new ConfluenceClient(config);
      const wikiJsClient = new (await import('./wikijs-client')).WikiJsClient(wikiJsConfig);
      const converter = new MarkdownConverter();

      // Use markdown editor directly since we know it works
      const markdownEditor = { key: 'markdown' };
      console.log(`📝 Using editor: ${markdownEditor.key}`);

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
          let markdown = converter.convertToMarkdown(page.body.storage.value, { 
            pageId: page.id,
            preserveHtmlTables: options.htmlTables 
          });
          
          // Convert relative image URLs to absolute
          markdown = converter.convertImageUrls(markdown, config.baseUrl);
          
          if (!options.dryRun) {
            let updatedMarkdown = markdown;
            let uploadedAssets: any[] = [];
            
            // Process images for Wiki.js only if requested and not explicitly skipped
            if (options.uploadImages && !options.skipImages) {
              console.log(`  🖼️  Processing images for Wiki.js upload...`);
              const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`;
              const result = await converter.processImagesForWikiJs(
                markdown,
                tempImagesDir,
                config.baseUrl,
                authHeader,
                wikiJsClient,
                options.uploadPath,
                config // Pass config for SSL ignore setting
              );
              updatedMarkdown = result.markdown;
              uploadedAssets = result.uploadedAssets;
            } else if (options.skipImages) {
              console.log(`  ⏭️  Skipping image processing as requested`);
              // Remove image references from markdown
              updatedMarkdown = markdown.replace(/!\[([^\]]*)\]\([^)]+\)/g, '<!-- Image removed: $1 -->');
            } else {
              console.log(`  📋 Images will be processed with default behavior (use --upload-images to upload to Wiki.js)`);
            }
            
            // Convert to Wiki.js compatible markdown
            const wikiJsMarkdown = converter.convertToWikiJsMarkdown(updatedMarkdown);
            
            // Generate Wiki.js page path (preserve hierarchy if requested)
            const pagePath = options.preserveHierarchy 
              ? (await import('./wikijs-client')).WikiJsClient.createHierarchicalPath(page, options.pagePrefix || spaceKey, namespace)
              : (await import('./wikijs-client')).WikiJsClient.sanitizePagePath(
                  page.title, 
                  options.pagePrefix || spaceKey,
                  namespace
                );
            
            // Check if page already exists
            console.log(`🔍 Checking for existing page at path: "${pagePath}"`);
            const existingPage = await wikiJsClient.getPageByPath(pagePath, namespace);
            console.log(`📄 Existing page lookup result: ${existingPage ? `Found page with ID ${existingPage.id}` : 'No existing page found'}`);
            
            
            // Handle existing page based on update flag
            if (existingPage && options.update === false) {
              console.log(`  ⏭️  Skipping existing page at /${pagePath} (use --update to overwrite)`);
              results.push({
                confluencePage: page,
                wikiJsPage: existingPage,
                uploadedAssets: [],
                status: 'skipped'
              });
              continue;
            }
            
            const wikiJsPage = {
              path: pagePath,
              title: page.title,
              content: wikiJsMarkdown,
              contentType: 'markdown',
              editor: markdownEditor.key,
              locale: namespace || 'en',
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
            const pagePath = options.preserveHierarchy 
              ? (await import('./wikijs-client')).WikiJsClient.createHierarchicalPath(page, options.pagePrefix || spaceKey, namespace)
              : (await import('./wikijs-client')).WikiJsClient.sanitizePagePath(
                  page.title, 
                  options.pagePrefix || spaceKey,
                  namespace
                );
            
            // Check if page exists in dry-run mode
            const existingPage = await wikiJsClient.getPageByPath(pagePath, namespace);
            
            if (existingPage && options.update === false) {
              console.log(`  ⏭️  Would skip existing page: /${pagePath} (use --update to overwrite)`);
            } else if (existingPage) {
              console.log(`  🔄 Would update existing page: /${pagePath}`);
            } else {
              console.log(`  ✨ Would create new page: /${pagePath}`);
            }
            
            console.log(`  📊 Content length: ${wikiJsMarkdown.length} characters`);
            
            // Count images that would be processed
            const imageCount = (markdown.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || []).length;
            if (options.uploadImages && !options.skipImages) {
              console.log(`  🖼️  Would upload ${imageCount} images to Wiki.js`);
            } else if (options.skipImages) {
              console.log(`  ⏭️  Would skip ${imageCount} images`);
            } else {
              console.log(`  🖼️  Found ${imageCount} images (use --upload-images to upload to Wiki.js)`);
            }
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
        await fs.rm(tempImagesDir, { recursive: true });
      } catch (error) {
        // Ignore cleanup errors
      }

      // Create navigation structure if requested
      if (options.createNavigation && !options.dryRun && results.some(r => r.status === 'success')) {
        try {
          console.log(`\n🧭 Creating Wiki.js navigation structure...`);
          const { WikiJsClient } = await import('./wikijs-client');
          const successfulPages = results
            .filter(r => r.status === 'success')
            .map(r => r.confluencePage);
          
          const navigationTree = WikiJsClient.buildNavigationTree(successfulPages, spaceKey);
          
          if (navigationTree.length > 0) {
            const navResult = await wikiJsClient.createNavigation(navigationTree, spaceKey);
            if (navResult.responseResult.succeeded) {
              console.log(`  ✅ Navigation structure created successfully`);
            } else {
              console.log(`  ⚠️  Navigation creation completed with warnings: ${navResult.responseResult.message}`);
            }
          } else {
            console.log(`  ℹ️  No navigation structure to create (no hierarchical pages found)`);
          }
        } catch (error) {
          console.error(`  ❌ Failed to create navigation: ${error}`);
        }
      }

      // Summary
      console.log(`\n🎉 Export completed!`);
      const successful = results.filter(r => r.status === 'success').length;
      const failed = results.filter(r => r.status === 'error').length;
      const skipped = results.filter(r => r.status === 'skipped').length;
      const totalImages = results.reduce((sum, r) => sum + (r.uploadedAssets?.length || 0), 0);
      
      console.log(`✅ Successfully processed: ${successful} pages`);
      if (skipped > 0) {
        console.log(`⏭️  Skipped existing: ${skipped} pages (use --update to overwrite)`);
      }
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
  .option('--namespace <namespace>', 'Wiki.js namespace/locale (e.g., "de" for German, "fr" for French)')
  .option('--upload-images', 'Upload images to Wiki.js')
  .option('--upload-path <path>', 'Wiki.js upload path for images', '/uploads')
  .option('--update', 'Update existing pages (default: true). Use --no-update to skip existing pages')
  .option('--dry-run', 'Preview without uploading')
  .action(async (options) => {
    try {
      const wikiJsConfig = loadWikiJsConfig();
      const inputPath = options.input;

      // Override namespace from CLI option if provided
      const namespace = (options.namespace || wikiJsConfig.namespace).trim();

      if (!inputPath) {
        console.error('Error: Input file or directory is required. Use --input option');
        process.exit(1);
      }

      console.log(`📚 Converting to Wiki.js format`);
      console.log(`📡 Wiki.js: ${wikiJsConfig.baseUrl}`);
      console.log(`🌐 Namespace: ${namespace}`);
      console.log(`🔄 Update mode: ${options.update !== false ? 'Update existing pages' : 'Skip existing pages'}`);

      const wikiJsClient = new (await import('./wikijs-client')).WikiJsClient(wikiJsConfig);
      const converter = new MarkdownConverter();

      // Use markdown editor directly since we know it works
      const markdownEditor = { key: 'markdown' };
      console.log(`📝 Using editor: ${markdownEditor.key}`);

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
            
            // Create temporary directory for image processing
            const tempImagesDir = path.join(process.cwd(), 'temp-images-convert');
            await fs.mkdir(tempImagesDir, { recursive: true });
            
            try {
              // Process images: download from local paths and upload to Wiki.js
              const imageMatches = wikiJsMarkdown.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
              console.log(`  📊 Found ${imageMatches.length} image references`);
              
              for (const imageMatch of imageMatches) {
                const matchResult = imageMatch.match(/!\[([^\]]*)\]\(([^)]+)\)/);
                if (!matchResult) continue;
                
                const [fullMatch, alt, imagePath] = matchResult;
                
                if (!imagePath || imagePath.startsWith('http')) {
                  console.log(`    ⏭️  Skipping external/absolute image: ${imagePath}`);
                  continue;
                }
                
                // Convert relative path to absolute path
                const baseDir = path.dirname(filePath);
                const absoluteImagePath = path.resolve(baseDir, imagePath);
                
                try {
                  // Check if local image file exists
                  await fs.access(absoluteImagePath);
                  
                  console.log(`    📤 Uploading: ${path.basename(absoluteImagePath)}`);
                  
                  try {
                    // Upload to Wiki.js
                    const uploadedAsset = await wikiJsClient.uploadAsset(absoluteImagePath, options.uploadPath);
                    uploadedAssets.push(uploadedAsset);
                    
                    // Replace the image reference in markdown
                    // Use the WikiJsClient utility to construct the correct URL
                    // Use the configured upload path from .env (removing leading slash)
                    const folderName = (wikiJsConfig.uploadPath || '/uploads').replace(/^\//, '');
                    console.log(`    🔗 Using folder path for URL: "${folderName}" (from uploadPath: "${wikiJsConfig.uploadPath}")`);
                    console.log(`    📁 Original filename: "${path.basename(absoluteImagePath)}", Upload result filename: "${uploadedAsset.filename}"`);
                    const newImageUrl = WikiJsClient.getAssetUrl(wikiJsConfig.baseUrl, uploadedAsset, folderName);
                    
                    wikiJsMarkdown = wikiJsMarkdown.replace(fullMatch, `![${alt}](${newImageUrl})`);
                    
                    console.log(`    ✅ Uploaded and replaced: ${uploadedAsset.filename} -> ${newImageUrl}`);
                  } catch (uploadError) {
                    console.log(`    ❌ Upload failed for ${path.basename(absoluteImagePath)}: ${uploadError}`);
                    // Keep original local path in markdown as fallback
                  }
                } catch (error) {
                  console.log(`    ❌ Failed to process image ${absoluteImagePath}: ${error}`);
                }
              }
              
              // Clean up temp directory
              await fs.rm(tempImagesDir, { recursive: true }).catch(() => {});
              
            } catch (error) {
              console.log(`    ❌ Error processing images: ${error}`);
              // Clean up temp directory on error
              await fs.rm(tempImagesDir, { recursive: true }).catch(() => {});
            }
          }
          
          if (!options.dryRun) {
            // Check if page exists
            const existingPage = await wikiJsClient.getPageByPath(pagePath, namespace);
            
            // Handle existing page based on update flag
            if (existingPage && options.update === false) {
              console.log(`  ⏭️  Skipping existing page at /${pagePath} (use --update to overwrite)`);
              continue;
            }
            
            const wikiJsPage = {
              path: pagePath,
              title: title,
              content: wikiJsMarkdown,
              contentType: 'markdown',
              editor: markdownEditor.key,
              locale: namespace || 'en',
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
            if (options.uploadImages && uploadedAssets.length > 0) {
              console.log(`  📊 Uploaded ${uploadedAssets.length} images`);
            }
          } else {
            // Dry run - check if page exists
            const existingPage = await wikiJsClient.getPageByPath(pagePath, namespace);
            
            if (existingPage && options.update === false) {
              console.log(`  ⏭️  Would skip existing page: /${pagePath} (use --update to overwrite)`);
            } else if (existingPage) {
              console.log(`  🔄 Would update existing page: /${pagePath}`);
            } else {
              console.log(`  ✨ Would create new page: /${pagePath}`);
            }
            
            console.log(`  📊 Content length: ${wikiJsMarkdown.length} characters`);
            
            // Show what images would be uploaded in dry-run mode
            if (options.uploadImages) {
              const imageMatches = wikiJsMarkdown.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [];
              console.log(`  🖼️  Would upload ${imageMatches.length} images`);
              
              for (const imageMatch of imageMatches) {
                const matchResult = imageMatch.match(/!\[([^\]]*)\]\(([^)]+)\)/);
                if (!matchResult) continue;
                
                const [, , imagePath] = matchResult;
                if (!imagePath.startsWith('http')) {
                  const baseDir = path.dirname(filePath);
                  const absoluteImagePath = path.resolve(baseDir, imagePath);
                  console.log(`    📤 Would upload: ${path.basename(absoluteImagePath)}`);
                }
              }
            }
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

program
  .command('test-connection')
  .description('Test connection to Confluence API')
  .action(async () => {
    try {
      const config = loadConfigWithOptions(program.opts());
      const client = new ConfluenceClient(config);
      
      console.log('🔍 Testing Confluence API connection...');
      console.log(`📡 Base URL: ${config.baseUrl}`);
      console.log(`👤 Username: ${config.username}`);
      console.log(`🔒 SSL Check: ${config.ignoreSSL ? 'Disabled' : 'Enabled'}`);
      
      await client.testConnection();
      console.log('\n✅ Connection test successful!');
    } catch (error) {
      console.error('\n❌ Connection test failed:', error);
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();
