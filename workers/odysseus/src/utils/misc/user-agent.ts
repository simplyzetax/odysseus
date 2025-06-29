export interface FNBuildData {
	season: number;
	build: number;
	cl: string;
	lobby: string;
}

const DEFAULT_BUILD_DATA: FNBuildData = {
	season: 0,
	build: 0.0,
	cl: '0',
	lobby: 'LobbySeason0',
} as const;

const REGEX_PATTERNS = {
	OFFICIAL: /(.*)\/(.*)-(CL-(\d+)(\s+\((.*?)\))?\s+(\w+)\/(\S*)(\s*\((.*?)\))?)/,
	BUILD_ID: /-(\d+)[, ]/,
	BUILD: /Release-(\d+\.\d+)/,
} as const;

const CL_SEASON_RANGES = {
	SEASON_0: 3724489,
	SEASON_1: 3790078,
} as const;

/**
 * Parses a Fortnite user agent string to extract build information
 * @param ua - The user agent string to parse
 * @returns Parsed build data including season, build number, and CL
 */
export function parseUserAgent(ua: string): FNBuildData {
	const buildData = { ...DEFAULT_BUILD_DATA };

	const matches = {
		official: REGEX_PATTERNS.OFFICIAL.exec(ua),
		buildId: REGEX_PATTERNS.BUILD_ID.exec(ua),
		build: REGEX_PATTERNS.BUILD.exec(ua),
	};

	if (matches.official) {
		updateBuildFromOfficialMatch(buildData, matches.official[7]);
	}

	if (matches.buildId) {
		buildData.cl = matches.buildId[1];
	}

	if (matches.build) {
		updateBuildFromBuildMatch(buildData, matches.build[1]);
	}

	if (Number.isNaN(buildData.season)) {
		updateBuildFromCL(buildData);
	}

	return buildData;
}

/**
 * Updates build data from official user agent match
 * @param buildData - The build data object to update
 * @param build - The build string from the official match
 */
function updateBuildFromOfficialMatch(buildData: FNBuildData, build: string): void {
	buildData.season = Number(build.split('.')[0]);
	buildData.build = Number.parseFloat(build);
	buildData.lobby = `LobbySeason${buildData.season}`;
}

/**
 * Updates build data from build match pattern
 * @param buildData - The build data object to update
 * @param build - The build string from the build match
 */
function updateBuildFromBuildMatch(buildData: FNBuildData, build: string): void {
	buildData.season = Number(build.split('.')[0]);
	buildData.build = Number.parseFloat(build);
	buildData.lobby = `LobbySeason${buildData.season}`;
}

/**
 * Updates build data using CL (changelist) number as fallback
 * @param buildData - The build data object to update
 */
function updateBuildFromCL(buildData: FNBuildData): void {
	buildData.season = getSeasonFromCL(buildData.cl);
	buildData.build = buildData.season;
	buildData.lobby = `LobbySeason${buildData.season}`;
}

/**
 * Determines the Fortnite season based on the CL (changelist) number
 * @param cl - The changelist number as a string
 * @returns The corresponding Fortnite season number
 */
export function getSeasonFromCL(cl: string): number {
	const clNumber = Number(cl);

	if (Number.isNaN(clNumber) || clNumber < CL_SEASON_RANGES.SEASON_0) {
		return 0;
	}

	if (clNumber <= CL_SEASON_RANGES.SEASON_1) {
		return 1;
	}

	return 2;
}
