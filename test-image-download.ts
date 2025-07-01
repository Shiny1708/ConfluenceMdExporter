import { MarkdownConverter } from './src/markdown-converter';
import * as path from 'path';
import * as fs from 'fs/promises';

async function testImageDownload() {
  console.log('🧪 Testing image download functionality...');

  const markdown = `# Test Page

## Images to Download

Here's a screenshot: ![Screenshot](/download/attachments/123456/screenshot.png "Page Screenshot")

And a diagram: ![Diagram](/download/thumbnails/123456/diagram.png?version=1&modificationDate=1640995200000)

External image (should be skipped): ![External](https://example.com/image.png)

Local image (should be skipped): ![Local](./local-image.png)
`;

  const converter = new MarkdownConverter();
  const outputDir = path.join(__dirname, '..', 'tests', 'outputs');
  const imagesDir = path.join(outputDir, 'images');
  
  // Simulate a fake Confluence base URL and auth
  const fakeBaseUrl = 'https://fake-confluence.example.com';
  const fakeAuth = 'Basic fake-auth-header';

  try {
    console.log('📝 Input markdown:');
    console.log(markdown);
    console.log('\n' + '='.repeat(50) + '\n');

    const result = await converter.downloadAndUpdateImages(
      markdown,
      imagesDir,
      fakeBaseUrl,
      fakeAuth
    );

    console.log('\n📝 Output markdown:');
    console.log(result);

  } catch (error) {
    console.error('Error during test:', error);
  }
}

testImageDownload().catch(console.error);
