
/**
 * Structure of the response body for MCP responses
 */    
export interface McpResponseBody {
    [key: string]: unknown;
    profileRevision?: number;
    profileChangesBaseRevision?: number;
    profileCommandRevision?: number;
}