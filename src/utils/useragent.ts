export type FNBuildData = {
    season: number;
    build: number;
    cl: string;
    lobby: string;
};

const DEFAULT_BUILD_DATA: FNBuildData = {
    season: 0,
    build: 0.0,
    cl: '0',
    lobby: 'LobbySeason0'
} as const;

const REGEX_PATTERNS = {
    OFFICIAL: /(.*)\/(.*)-(CL-(\d+)(\s+\((.*?)\))?\s+(\w+)\/(\S*)(\s*\((.*?)\))?)/,
    BUILD_ID: /-(\d+)[, ]/,
    BUILD: /Release-(\d+\.\d+)/
} as const;

const CL_SEASON_RANGES = {
    SEASON_0: 3724489,
    SEASON_1: 3790078
} as const;

export function parseUserAgent(ua: string): FNBuildData {

    const buildData = { ...DEFAULT_BUILD_DATA };

    const matches = {
        official: ua.match(REGEX_PATTERNS.OFFICIAL),
        buildId: ua.match(REGEX_PATTERNS.BUILD_ID),
        build: ua.match(REGEX_PATTERNS.BUILD)
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

function updateBuildFromOfficialMatch(buildData: FNBuildData, build: string): void {
    buildData.season = Number(build.split('.')[0]);
    buildData.build = Number.parseFloat(build);
    buildData.lobby = `LobbySeason${buildData.season}`;
}

function updateBuildFromBuildMatch(buildData: FNBuildData, build: string): void {
    buildData.season = Number(build.split('.')[0]);
    buildData.build = Number.parseFloat(build);
    buildData.lobby = `LobbySeason${buildData.season}`;
}

function updateBuildFromCL(buildData: FNBuildData): void {
    buildData.season = getSeasonFromCL(buildData.cl);
    buildData.build = buildData.season;
    buildData.lobby = `LobbySeason${buildData.season}`;
}

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