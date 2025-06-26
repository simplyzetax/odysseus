// Type for the formatted item structure that matches Fortnite's MCP format
export interface FormattedItem {
    templateId: string;
    attributes: Record<string, any> & {
        quantity: number;
        favorite?: boolean;
        item_seen?: 0 | 1;
    };
}