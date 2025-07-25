import type { Hotfix, NewHotfix } from '@core/db/schemas/hotfixes';

export class IniParser {
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
		const filteredHotfixes = this.hotfixes.filter((hotfix) => {
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
		iniLines.push('; Generated ini file');
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
	 * @returns .ini file content or undefined if file not found
	 */
	public getIniForFile(
		filename: string,
		includeDisabled: boolean = false,
		scope?: string,
		includeTimestamp: boolean = true,
	): string | undefined {
		const fileMap = this.transformToIniFiles(includeDisabled, scope, includeTimestamp);
		return fileMap.get(filename);
	}

	/**
	 * Gets all unique filenames from the hotfixes
	 * @returns Array of filenames
	 */
	public getFilenames(): string[] {
		const filenames = new Set(this.hotfixes.map((h) => h.filename));
		return Array.from(filenames).sort();
	}

	/**
	 * Gets all unique sections for a specific filename
	 * @param filename The filename to get sections for
	 * @returns Array of section names
	 */
	public getSectionsForFile(filename: string): string[] {
		const fileSections = this.hotfixes.filter((h) => h.filename === filename).map((h) => h.section);
		return Array.from(new Set(fileSections)).sort();
	}

	/**
	 * Parses an .ini file content into an array of hotfix objects.
	 * This does not save to the database, it just returns the representation.
	 * @param iniContent The string content of the .ini file
	 * @param filename The filename this content belongs to
	 * @returns An array of NewHotfix objects
	 */
	public static parseIniToHotfixes(iniContent: string, filename: string): NewHotfix[] {
		const hotfixes: NewHotfix[] = [];
		const lines = iniContent.split(/\r?\n/);
		let currentSection = '';

		for (const line of lines) {
			const trimmedLine = line.trim();

			if (trimmedLine === '' || trimmedLine.startsWith(';')) {
				continue;
			}

			if (trimmedLine.startsWith('[') && trimmedLine.endsWith(']')) {
				currentSection = trimmedLine.substring(1, trimmedLine.length - 1);
				continue;
			}

			if (currentSection) {
				const parsedHotfix = IniParser.parseKeyValuePair(line, filename, currentSection);
				if (parsedHotfix) {
					hotfixes.push(parsedHotfix);
				}
			}
		}

		return hotfixes;
	}

	/**
	 * Parses a single line of an .ini file into a hotfix object.
	 * @param line The line to parse
	 * @param filename The filename of the hotfix
	 * @param section The section the hotfix belongs to
	 * @returns A NewHotfix object or null if parsing fails
	 */
	public static parseKeyValuePair(line: string, filename: string, section: string): NewHotfix | null {
		const parts = line.split(';');
		const keyValuePart = parts[0];
		const commentPart = parts.length > 1 ? parts.slice(1).join(';') : undefined;

		const keyValue = keyValuePart.split('=');
		if (keyValue.length < 2) {
			return null;
		}

		const key = keyValue[0].trim();
		const value = keyValue.slice(1).join('=').trim();

		const hotfix: NewHotfix = {
			filename,
			section,
			key,
			value,
			enabled: true,
			scope: 'user',
		};

		if (commentPart) {
			const metadata = commentPart.trim();
			const metaParts = metadata.split(',').map((p) => p.trim());

			for (const meta of metaParts) {
				if (meta === 'disabled') {
					hotfix.enabled = false;
				} else if (meta.startsWith('scope:')) {
					hotfix.scope = meta.substring('scope:'.length);
				} else if (meta.startsWith('account:')) {
					const accountId = meta.substring('account:'.length);
					if (accountId) {
						hotfix.accountId = accountId;
					}
				}
			}
		}

		return hotfix;
	}
}
