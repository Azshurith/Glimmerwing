/** Saved stats and unlocked fairies. */
export interface Progress {
    wins: number;
    bestChain: number;
    fevers: number;
    flawless: number;
    unlocked: string[];
}

/** The player's settings, saved in this browser. */
export interface Settings {
    /**
     * On an upright phone, against the CPU: hide the rival's meadow and console so your meadow takes the whole
     * screen (taller, up to the top), with a slim bar for the round and the rival's hearts.
     */
    hideRival: boolean;
}
