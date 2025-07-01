import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { ConfluenceConfig, ConfluencePage, ConfluenceSpace, ConfluenceSearchResult } from './types';

export class ConfluenceClient {
  private client: AxiosInstance;
  private config: ConfluenceConfig;

  constructor(config: ConfluenceConfig) {
    this.config = config;
    
    // Create HTTPS agent that ignores SSL errors if configured
    const httpsAgent = config.ignoreSSL 
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;
    
    // Start with base URL only - we'll determine the correct API path
    this.client = axios.create({
      baseURL: config.baseUrl,
      auth: {
        username: config.username,
        password: config.password,
      },
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      httpsAgent,
    });
  }

  /**
   * Get all spaces
   */
  async getSpaces(): Promise<ConfluenceSpace[]> {
    try {
      await this.ensureApiPath();
      console.log(`Making request to: ${this.client.defaults.baseURL}/space`);
      const response = await this.client.get('/space');
      return response.data.results;
    } catch (error: any) {
      console.error('API Request failed:');
      console.error('- URL:', `${this.client.defaults.baseURL}/space`);
      console.error('- Status:', error.response?.status);
      console.error('- Status Text:', error.response?.statusText);
      console.error('- Response:', error.response?.data);
      throw new Error(`Failed to fetch spaces: ${error.message || error}`);
    }
  }

  /**
   * Get pages from a specific space
   */
  async getPagesFromSpace(spaceKey: string, limit: number = 50, start: number = 0): Promise<ConfluenceSearchResult> {
    try {
      await this.ensureApiPath();
      // Use the correct Confluence API endpoint for getting content from a space
      const response = await this.client.get('/content', {
        params: {
          spaceKey: spaceKey,
          type: 'page',
          status: 'current',
          limit,
          start,
          expand: 'body.storage,version,ancestors',
        },
      });
      
      console.log(`📊 API Response structure for space ${spaceKey}:`, {
        hasResults: 'results' in response.data,
        keys: Object.keys(response.data),
        resultsType: typeof response.data.results,
        resultsLength: response.data.results?.length || 'N/A',
        sampleData: response.data.results ? response.data.results.slice(0, 2) : response.data
      });
      
      // Handle different possible response structures
      if (response.data.results) {
        return response.data;
      } else if (Array.isArray(response.data)) {
        // Some Confluence APIs return the array directly
        return {
          results: response.data,
          size: response.data.length,
          start: start,
          limit: limit
        };
      } else {
        throw new Error(`Unexpected response structure: ${JSON.stringify(Object.keys(response.data))}`);
      }
    } catch (error) {
      throw new Error(`Failed to fetch pages from space ${spaceKey}: ${error}`);
    }
  }

  /**
   * Get a specific page by ID
   */
  async getPage(pageId: string): Promise<ConfluencePage> {
    try {
      await this.ensureApiPath();
      const response = await this.client.get(`/content/${pageId}`, {
        params: {
          expand: 'body.storage,version,ancestors',
        },
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch page ${pageId}: ${error}`);
    }
  }

  /**
   * Search for pages
   */
  async searchPages(query: string, limit: number = 50): Promise<ConfluenceSearchResult> {
    try {
      const response = await this.client.get('/search', {
        params: {
          cql: query,
          limit,
          expand: 'content.body.storage,content.version,content.ancestors',
        },
      });
      return {
        results: response.data.results.map((result: any) => result.content),
        size: response.data.size,
        start: response.data.start,
        limit: response.data.limit,
      };
    } catch (error) {
      throw new Error(`Failed to search pages: ${error}`);
    }
  }

  /**
   * Get all pages from a space (handles pagination)
   */
  async getAllPagesFromSpace(spaceKey: string): Promise<ConfluencePage[]> {
    const allPages: ConfluencePage[] = [];
    let start = 0;
    const limit = 50;

    while (true) {
      const result = await this.getPagesFromSpace(spaceKey, limit, start);
      
      // Safety check for results
      if (!result || !result.results || !Array.isArray(result.results)) {
        console.error('❌ Invalid response structure:', result);
        throw new Error(`Invalid response structure from Confluence API. Expected 'results' array but got: ${typeof result?.results}`);
      }
      
      allPages.push(...result.results);

      if (result.results.length < limit) {
        break;
      }
      start += limit;
    }

    return allPages;
  }

  /**
   * Test API connectivity and determine the correct endpoint
   */
  async testConnection(): Promise<void> {
    const endpoints = [
      '/rest/api/space',        // Direct REST API (Confluence Server/Data Center)
      '/wiki/rest/api/space',   // Standard wiki path (some installations)
      '/confluence/rest/api/space' // Alternative path
    ];

    for (const endpoint of endpoints) {
      try {
        console.log(`Testing endpoint: ${this.client.defaults.baseURL}${endpoint}`);
        await this.client.get(endpoint);
        console.log(`✅ Successfully connected using endpoint: ${endpoint}`);
        
        // Update the baseURL to include the working API path
        const apiPath = endpoint.replace('/space', '');
        this.client.defaults.baseURL = `${this.config.baseUrl}${apiPath}`;
        console.log(`📡 Updated base URL to: ${this.client.defaults.baseURL}`);
        return;
      } catch (error: any) {
        console.log(`❌ Failed with endpoint ${endpoint}: ${error.response?.status || error.message}`);
      }
    }
    
    throw new Error('Unable to connect to Confluence API with any known endpoint');
  }

  /**
   * Ensure the client has the correct API base URL
   */
  private async ensureApiPath(): Promise<void> {
    // If the baseURL already includes an API path, we're good
    if (this.client.defaults.baseURL?.includes('/rest/api')) {
      return;
    }
    
    // Otherwise, determine the correct path
    await this.testConnection();
  }
}
