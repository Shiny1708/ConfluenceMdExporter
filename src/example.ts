import { loadConfig } from './config';
import { ConfluenceClient } from './confluence-client';
import { MarkdownConverter } from './markdown-converter';

/**
 * Example script showing how to use the Confluence Markdown Exporter programmatically
 */
async function example() {
  try {
    // Load configuration from .env file
    const config = loadConfig();
    
    // Initialize the Confluence client and markdown converter
    const client = new ConfluenceClient(config);
    const converter = new MarkdownConverter();

    console.log('Connected to Confluence at:', config.baseUrl);

    // Example 1: List all spaces
    console.log('\n--- Available Spaces ---');
    const spaces = await client.getSpaces();
    spaces.slice(0, 5).forEach(space => {
      console.log(`${space.key}: ${space.name}`);
    });

    // Example 2: Export a specific space (if SPACE_KEY is configured)
    if (config.spaceKey) {
      console.log(`\n--- Exporting Space: ${config.spaceKey} ---`);
      const pages = await client.getAllPagesFromSpace(config.spaceKey);
      console.log(`Found ${pages.length} pages in space ${config.spaceKey}`);

      // Export first 3 pages as an example
      for (let i = 0; i < Math.min(3, pages.length); i++) {
        const page = pages[i];
        console.log(`Converting: ${page.title}`);
        await converter.convertPageToFile(page, config.outputDir);
      }
    }

    // Example 3: Search for pages
    console.log('\n--- Search Example ---');
    const searchResults = await client.searchPages('type=page', 5);
    console.log(`Found ${searchResults.results.length} pages matching search`);
    searchResults.results.forEach(page => {
      console.log(`- ${page.title} (ID: ${page.id})`);
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  example();
}
