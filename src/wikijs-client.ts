import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { WikiJsConfig, WikiJsAsset, WikiJsPage, ConfluencePage, NavigationItem, ConfluencePageAncestor } from './types';

export class WikiJsClient {
  private client: AxiosInstance;
  private config: WikiJsConfig;

  constructor(config: WikiJsConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: `${config.baseUrl}/graphql`,
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Upload an asset (image) to Wiki.js using REST endpoint with proper metadata
   */
  async uploadAsset(filePath: string, uploadPath?: string): Promise<WikiJsAsset> {
    const fileName = path.basename(filePath);
    const targetPath = uploadPath || this.config.uploadPath || '/uploads';

    try {
      // First, get available folders to find the target folder ID
      const folders = await this.getAssetFolders(0); // Start with root folders (parentFolderId = 0)
      console.log('Available asset folders:', folders.map(f => `${f.name} (id: ${f.id}, slug: ${f.slug})`));
      
      // Find the uploads folder or use root folder
      let targetFolder = folders.find(f => f.slug === 'uploads' || f.name.toLowerCase() === 'uploads');
      if (!targetFolder) {
        // Use root folder (ID 0) as fallback
        targetFolder = { id: 0, name: 'root', slug: 'root' };
      }
      
      console.log(`Using folder: ${targetFolder.name} (id: ${targetFolder.id})`);

      // Read file
      const fileBuffer = await fs.readFile(filePath);
      const mimeType = this.getMimeType(fileName);
      
      console.log(`Upload details: fileName=${fileName}, fileSize=${fileBuffer.length}, folderId=${targetFolder.id}, mimeType=${mimeType}`);

      // Create form data for upload with proper Wiki.js format
      // Wiki.js expects two parts both named 'mediaUpload':
      // 1. JSON metadata with folderId
      // 2. The actual file data
      const formData = new FormData();
      const blob = new Blob([fileBuffer], { type: mimeType });
      
      // First part: JSON metadata
      formData.append('mediaUpload', JSON.stringify({ folderId: targetFolder.id }));
      
      // Second part: File data
      formData.append('mediaUpload', blob, fileName);

      // Use the Wiki.js upload endpoint
      const uploadClient = axios.create({
        baseURL: `${this.config.baseUrl}`,
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
      });

      const response = await uploadClient.post('/u', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      console.log('Upload response:', response.data);
      
      // Handle the response - Wiki.js returns upload info
      if (response.data && response.data.succeeded !== false) {
        // Always use lowercase filename to match Wiki.js behavior
        const normalizedFilename = fileName.toLowerCase();
        
        const asset: WikiJsAsset = {
          id: response.data.id || 0,
          filename: normalizedFilename, // Always use lowercase
          hash: response.data.hash || '',
          ext: response.data.ext || path.extname(normalizedFilename).substring(1),
          kind: response.data.kind || 'image',
          mime: response.data.mime || mimeType,
          fileSize: response.data.fileSize || fileBuffer.length,
          metadata: response.data.metadata || { folderId: targetFolder.id, folderName: targetFolder.name },
          createdAt: response.data.createdAt || new Date().toISOString(),
          updatedAt: response.data.updatedAt || new Date().toISOString(),
        };
        
        console.log(`Successfully uploaded asset: ${fileName} -> ${normalizedFilename}`, asset);
        return asset;
      } else {
        throw new Error(response.data?.message || 'Upload failed with unknown error');
      }
    } catch (error: any) {
      console.log('Upload error details:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL,
        }
      });
      throw new Error(`Failed to upload asset ${fileName}: ${error.message}`);
    }
  }

  /**
   * Get MIME type for a file based on its extension
   */
  private getMimeType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase();
    switch (ext) {
      case '.jpg':
      case '.jpeg':
        return 'image/jpeg';
      case '.png':
        return 'image/png';
      case '.gif':
        return 'image/gif';
      case '.svg':
        return 'image/svg+xml';
      case '.webp':
        return 'image/webp';
      case '.bmp':
        return 'image/bmp';
      default:
        return 'image/png'; // fallback
    }
  }

  /**
   * Create or update a page in Wiki.js
   */
  async createPage(page: WikiJsPage): Promise<WikiJsPage> {
    const mutation = `
      mutation createPage($content: String!, $description: String!, $editor: String!, $isPublished: Boolean!, $isPrivate: Boolean!, $locale: String!, $path: String!, $tags: [String]!, $title: String!) {
        pages {
          create(content: $content, description: $description, editor: $editor, isPublished: $isPublished, isPrivate: $isPrivate, locale: $locale, path: $path, tags: $tags, title: $title) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              updatedAt
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query: mutation,
        variables: {
          content: page.content,
          description: page.description || '',
          editor: page.editor || 'markdown',
          isPublished: page.isPublished !== false,
          isPrivate: page.isPrivate || false,
          locale: page.locale || 'en',
          path: page.path.startsWith('/') ? page.path.substring(1) : page.path, // Remove leading slash if present
          tags: page.tags || [],
          title: page.title,
        },
      });

      if (response.data.errors) {
        throw new Error(`Wiki.js API error: ${JSON.stringify(response.data.errors)}`);
      }

      const result = response.data.data.pages.create;
      if (!result.responseResult.succeeded) {
        throw new Error(`Failed to create page: ${result.responseResult.message}`);
      }

      // Return a combined object with the input data and the response
      return {
        ...page,
        id: result.page.id,
        updatedAt: result.page.updatedAt,
      };
    } catch (error) {
      throw new Error(`Failed to create Wiki.js page: ${error}`);
    }
  }

  /**
   * Update an existing page in Wiki.js
   */
  async updatePage(pageId: number, updates: Partial<WikiJsPage>): Promise<WikiJsPage> {
    const mutation = `
      mutation ($id: Int!, $content: String, $description: String, $editor: String, $isPrivate: Boolean, $isPublished: Boolean, $locale: String, $path: String, $publishEndDate: Date, $publishStartDate: Date, $tags: [String], $title: String) {
        pages {
          update(
            id: $id
            content: $content
            description: $description
            editor: $editor
            isPrivate: $isPrivate
            isPublished: $isPublished
            locale: $locale
            path: $path
            publishEndDate: $publishEndDate
            publishStartDate: $publishStartDate
            tags: $tags
            title: $title
          ) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
            page {
              id
              path
              hash
              title
              description
              isPrivate
              isPublished
              content
              contentType
              createdAt
              updatedAt
              editor
              locale
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query: mutation,
        variables: {
          id: pageId,
          ...updates,
        },
      });

      if (response.data.errors) {
        throw new Error(`Wiki.js API error: ${JSON.stringify(response.data.errors)}`);
      }

      const result = response.data.data.pages.update;
      if (!result.responseResult.succeeded) {
        throw new Error(`Failed to update page: ${result.responseResult.message}`);
      }

      return result.page;
    } catch (error) {
      throw new Error(`Failed to update Wiki.js page: ${error}`);
    }
  }

  /**
   * Get page by path
   */
  async getPageByPath(path: string): Promise<WikiJsPage | null> {
    const query = `
      query ($path: String!) {
        pages {
          single(path: $path) {
            id
            path
            hash
            title
            description
            isPrivate
            isPublished
            content
            contentType
            createdAt
            updatedAt
            editor
            locale
            authorId
            creatorId
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
        variables: { path },
      });

      if (response.data.errors) {
        return null;
      }

      return response.data.data.pages.single;
    } catch (error) {
      return null;
    }
  }

  /**
   * Query available editors from Wiki.js
   */
  async getAvailableEditors(): Promise<any[]> {
    const query = `
      query {
        editors {
          key
          isEnabled
          config {
            key
            value
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
      });

      if (response.data.errors) {
        console.log('Error querying editors:', response.data.errors);
        return [];
      }

      return response.data.data.editors || [];
    } catch (error) {
      console.log('Failed to query editors:', error);
      return [];
    }
  }

  /**
   * Get available asset folders from Wiki.js
   */
  async getAssetFolders(parentFolderId: number = 0): Promise<any[]> {
    const query = `
      query listAssetFolders($parentFolderId: Int!) {
        assets {
          folders(parentFolderId: $parentFolderId) {
            id
            name
            slug
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
        variables: { parentFolderId },
      });

      if (response.data.errors) {
        console.log('Error querying asset folders:', response.data.errors);
        return [];
      }

      return response.data.data.assets.folders || [];
    } catch (error) {
      console.log('Failed to query asset folders:', error);
      return [];
    }
  }

  /**
   * Get asset information by filename
   */
  async getAssetByFilename(filename: string): Promise<any | null> {
    const query = `
      query getAssets($filename: String!) {
        assets {
          list(filename: $filename) {
            id
            filename
            hash
            ext
            kind
            mime
            fileSize
            metadata
            createdAt
            updatedAt
            folder {
              id
              name
              slug
            }
          }
        }
      }
    `;

    try {
      const response = await this.client.post('', {
        query,
        variables: { filename },
      });

      if (response.data.errors) {
        console.log('Error querying asset:', response.data.errors);
        return null;
      }

      const assets = response.data.data.assets.list || [];
      return assets.length > 0 ? assets[0] : null;
    } catch (error) {
      console.log('Failed to query asset:', error);
      return null;
    }
  }

  /**
   * Convert Confluence page path to Wiki.js compatible path
   */
  static sanitizePagePath(title: string, spaceKey?: string): string {
    // Sanitize the page title
    let path = WikiJsClient.sanitizePathSegment(title);

    // Prepend space key if provided
    if (spaceKey) {
      const sanitizedSpaceKey = WikiJsClient.sanitizePathSegment(spaceKey);
      path = `${sanitizedSpaceKey}/${path}`;
    }

    return path;
  }

  /**
   * Construct the correct asset URL for Wiki.js
   */
  static getAssetUrl(baseUrl: string, asset: WikiJsAsset, folderName?: string): string {
    // Remove trailing slash from baseUrl
    const cleanBaseUrl = baseUrl.replace(/\/$/, '');
    
    if (asset.hash) {
      // Use hash-based URL (preferred method)
      return `${cleanBaseUrl}/_assets/${asset.hash}.${asset.ext}`;
    } else {
      // Use folder-based URL - Wiki.js serves assets directly from /folder/filename
      // Get folder name from asset metadata, parameter, or default to 'uploads'
      const folder = folderName || 
                    asset.metadata?.folderName || 
                    (asset.metadata?.folderId === 0 ? '' : 'uploads'); // Root folder has no path
      
      if (folder) {
        return `/${folder}/${asset.filename}`;
      } else {
        // Root folder - no folder path needed
        return `/${asset.filename}`;
      }
    }
  }

  /**
   * Create hierarchical page path from Confluence page ancestors
   */
  static createHierarchicalPath(page: ConfluencePage, spaceKey?: string): string {
    const pathParts: string[] = [];
    
    // Add space key as root if provided
    if (spaceKey) {
      pathParts.push(WikiJsClient.sanitizePathSegment(spaceKey));
    }
    
    // Add ancestor paths (parent to child order)
    if (page.ancestors && page.ancestors.length > 0) {
      const ancestorPaths = page.ancestors.map((ancestor: ConfluencePageAncestor) => 
        WikiJsClient.sanitizePathSegment(ancestor.title)
      );
      pathParts.push(...ancestorPaths);
    }
    
    // Add the page itself
    const pagePath = WikiJsClient.sanitizePathSegment(page.title);
    
    pathParts.push(pagePath);
    
    return pathParts.join('/');
  }

  /**
   * Build navigation tree structure from pages
   */
  static buildNavigationTree(pages: ConfluencePage[], spaceKey?: string): NavigationItem[] {
    const tree: NavigationItem[] = [];
    const pageMap = new Map<string, ConfluencePage>();
    
    // Create a map of pages by ID for easy lookup
    pages.forEach(page => pageMap.set(page.id, page));
    
    // Find root pages (pages with no ancestors or ancestors not in this space)
    const rootPages = pages.filter(page => 
      !page.ancestors || 
      page.ancestors.length === 0 ||
      !page.ancestors.some((ancestor: ConfluencePageAncestor) => pageMap.has(ancestor.id))
    );
    
    // Build tree recursively
    function buildSubTree(parentId: string | null): NavigationItem[] {
      const children = pages.filter(page => {
        if (!page.ancestors || page.ancestors.length === 0) {
          return parentId === null;
        }
        const directParent = page.ancestors[page.ancestors.length - 1];
        return directParent && directParent.id === parentId;
      });
      
      return children.map(child => ({
        label: child.title,
        path: `/${WikiJsClient.createHierarchicalPath(child, spaceKey)}`,
        children: buildSubTree(child.id)
      }));
    }
    
    // Start with root pages
    return buildSubTree(null);
  }

  /**
   * Create or update Wiki.js navigation
   */
  async createNavigation(navigationTree: NavigationItem[], spaceKey: string): Promise<any> {
    const mutation = `
      mutation($key: String!, $config: [NavigationConfigInput]!) {
        navigation {
          updateTree(key: $key, config: $config) {
            responseResult {
              succeeded
              errorCode
              slug
              message
            }
          }
        }
      }
    `;

    const variables = {
      key: 'main', // or use space-specific navigation key
      config: [{
        label: spaceKey.toUpperCase(),
        icon: 'mdi-book-open-variant',
        children: navigationTree
      }]
    };

    try {
      const response = await this.client.post('/graphql', {
        query: mutation,
        variables: variables
      });
      return response.data.data.navigation.updateTree;
    } catch (error) {
      console.error('Failed to create navigation:', error);
      throw error;
    }
  }

  /**
   * Safely sanitize text for URL paths while preserving international characters
   */
  private static sanitizePathSegment(text: string): string {
    // Handle German umlauts and common special characters
    const transliterations: { [key: string]: string } = {
      'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'ß': 'ss',
      'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue',
      'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'å': 'a',
      'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
      'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
      'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
      'ù': 'u', 'ú': 'u', 'û': 'u',
      'ç': 'c', 'ñ': 'n',
      'À': 'A', 'Á': 'A', 'Â': 'A', 'Ã': 'A', 'Å': 'A',
      'È': 'E', 'É': 'E', 'Ê': 'E', 'Ë': 'E',
      'Ì': 'I', 'Í': 'I', 'Î': 'I', 'Ï': 'I',
      'Ò': 'O', 'Ó': 'O', 'Ô': 'O', 'Õ': 'O',
      'Ù': 'U', 'Ú': 'U', 'Û': 'U',
      'Ç': 'C', 'Ñ': 'N'
    };
    
    let sanitized = text;
    
    // Apply transliterations for common special characters
    Object.entries(transliterations).forEach(([from, to]) => {
      sanitized = sanitized.replace(new RegExp(from, 'g'), to);
    });
    
    // Convert to lowercase
    sanitized = sanitized.toLowerCase();
    
    // Replace spaces and unsafe URL characters with hyphens
    // Keep: letters (including extended Latin), numbers, hyphens, underscores
    sanitized = sanitized
      .replace(/[\s\/\\:*?"<>|]+/g, '-')  // Replace unsafe chars and spaces with hyphens
      .replace(/[^\w\-]/g, '')           // Remove remaining special chars (keeping word chars and hyphens)
      .replace(/-+/g, '-')               // Collapse multiple hyphens
      .replace(/^-|-$/g, '');            // Remove leading/trailing hyphens
    
    return sanitized;
  }

}
