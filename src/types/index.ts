/**
 * Git branch information interface
 */
export interface Branch {
  /** Branch name */
  name: string;
  /** Whether it is a local branch */
  isLocal: boolean;
  /** Branch existence status */
  exists: {
    /** Whether it exists locally */
    local: boolean;
    /** Whether it exists remotely */
    remote: boolean;
  };
  /** Whether it is the currently checked out branch */
  isCurrentBranch: boolean;
  /** Whether it is the main branch (main/master) */
  isMainBranch: boolean;
  /** Committer date of the last commit (ms since epoch) */
  lastCommit: number;
}

/**
 * Git stash entry
 */
export interface Stash {
  /** Reflog selector, e.g. `stash@{0}`: shifts when a newer stash is dropped */
  ref: string;
  /** Commit hash of the stash: stable, identifies it across refreshes */
  hash: string;
  /** Stash message, e.g. `WIP on main: 1a2b3c4 subject` */
  message: string;
  /** Date the stash was created (ms since epoch) */
  date: number;
}

/**
 * File changed by a stash or a branch
 */
export interface ChangedFile {
  path: string;
  added: number;
  deleted: number;
  binary: boolean;
}

/** Tabs of the view */
export type Tab = 'branches' | 'stashes';
