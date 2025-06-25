import type { Hotfix } from "@core/db/schemas/hotfixes";

export class HotfixParser {

    private hotfixes: Hotfix[];

    constructor(hotfixes: Hotfix[]) {
        this.hotfixes = hotfixes;
    }

    /**
     * Transforms all hotfixes into a map of filename -> .ini content
     * @param includeDisabled Whether to include disabled hotfixes (default: false)
     * @param scope Filter by scope (default: 'user')
     * @param includeTimestamp Whether to include timestamp in generated files (default: true)
     * @returns Map of filename to .ini file content
     */
    public transformToIniFiles(includeDisabled: boolean = false, scope?: string, includeTimestamp: boolean = true): Map<string, string> {
        const fileMap = new Map<string, string>();

        // Filter hotfixes based on criteria
        const filteredHotfixes = this.hotfixes.filter(hotfix => {
            if (!includeDisabled && !hotfix.enabled) return false;
            if (scope && hotfix.scope !== scope) return false;
            return true;
        });

        // Group hotfixes by filename
        const groupedByFile = this.groupByFilename(filteredHotfixes);

        // Transform each file group into .ini format
        for (const [filename, hotfixes] of groupedByFile) {
            const iniContent = this.transformFileToIni(hotfixes, includeTimestamp);
            fileMap.set(filename, iniContent);
        }

        return fileMap;
    }

    /**
     * Transforms hotfixes for a single file into .ini format
     * @param hotfixes Array of hotfixes for a single file
     * @param includeTimestamp Whether to include timestamp in generated file (default: true)
     * @returns .ini formatted string
     */
    private transformFileToIni(hotfixes: Hotfix[], includeTimestamp: boolean = true): string {
        const sections = this.groupBySection(hotfixes);
        const iniLines: string[] = [];

        // Add header comment
        iniLines.push('; Generated hotfix configuration');
        if (includeTimestamp) {
            iniLines.push('; Auto-generated on ' + new Date().toISOString());
        }
        iniLines.push('');

        // Process each section
        for (const [sectionName, sectionHotfixes] of sections) {
            // Add section header
            iniLines.push(`[${sectionName}]`);

            // Add key-value pairs
            for (const hotfix of sectionHotfixes) {
                const line = this.formatKeyValuePair(hotfix);
                iniLines.push(line);
            }

            // Add empty line after section (except for last section)
            iniLines.push('');
        }

        // Remove trailing empty line
        if (iniLines[iniLines.length - 1] === '') {
            iniLines.pop();
        }

        return iniLines.join('\n');
    }

    /**
     * Formats a hotfix into a key=value pair with optional comment
     * @param hotfix The hotfix to format
     * @returns Formatted .ini line
     */
    private formatKeyValuePair(hotfix: Hotfix): string {
        let line = `${hotfix.key}=${hotfix.value}`;

        // Add comment with metadata if needed
        const metadata: string[] = [];
        if (!hotfix.enabled) metadata.push('disabled');
        if (hotfix.scope !== 'user') metadata.push(`scope:${hotfix.scope}`);
        if (hotfix.accountId) metadata.push(`account:${hotfix.accountId}`);

        if (metadata.length > 0) {
            line += ` ; ${metadata.join(', ')}`;
        }

        return line;
    }

    /**
     * Groups hotfixes by filename
     * @param hotfixes Array of hotfixes to group
     * @returns Map of filename to hotfixes array
     */
    private groupByFilename(hotfixes: Hotfix[]): Map<string, Hotfix[]> {
        const grouped = new Map<string, Hotfix[]>();

        for (const hotfix of hotfixes) {
            if (!grouped.has(hotfix.filename)) {
                grouped.set(hotfix.filename, []);
            }
            grouped.get(hotfix.filename)!.push(hotfix);
        }

        return grouped;
    }

    /**
     * Groups hotfixes by section within a file
     * @param hotfixes Array of hotfixes to group by section
     * @returns Map of section name to hotfixes array
     */
    private groupBySection(hotfixes: Hotfix[]): Map<string, Hotfix[]> {
        const grouped = new Map<string, Hotfix[]>();

        for (const hotfix of hotfixes) {
            if (!grouped.has(hotfix.section)) {
                grouped.set(hotfix.section, []);
            }
            grouped.get(hotfix.section)!.push(hotfix);
        }

        // Sort sections alphabetically for consistent output
        return new Map([...grouped.entries()].sort());
    }

    /**
     * Gets a single .ini file content for a specific filename
     * @param filename The filename to get .ini content for
     * @param includeDisabled Whether to include disabled hotfixes
     * @param scope Filter by scope
     * @param includeTimestamp Whether to include timestamp in generated file (default: true)
     * @returns .ini file content or null if file not found
     */
    public getIniForFile(filename: string, includeDisabled: boolean = false, scope?: string, includeTimestamp: boolean = true): string | null {
        const fileMap = this.transformToIniFiles(includeDisabled, scope, includeTimestamp);
        return fileMap.get(filename) || null;
    }

    /**
     * Gets all unique filenames from the hotfixes
     * @returns Array of filenames
     */
    public getFilenames(): string[] {
        const filenames = new Set(this.hotfixes.map(h => h.filename));
        return Array.from(filenames).sort();
    }

    /**
     * Gets all unique sections for a specific filename
     * @param filename The filename to get sections for
     * @returns Array of section names
     */
    public getSectionsForFile(filename: string): string[] {
        const fileSections = this.hotfixes
            .filter(h => h.filename === filename)
            .map(h => h.section);
        return Array.from(new Set(fileSections)).sort();
    }

}