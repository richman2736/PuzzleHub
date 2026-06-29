import { Ionicons } from "@expo/vector-icons";
import { gameCatalog } from "@puzzlehub/config";
import type { TranslationKey } from "@puzzlehub/i18n";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";
import * as Haptics from "expo-haptics";
import {
  applySudokuMove,
  calculateSudokuScore,
  createInitialSudokuState,
  generateSudoku,
  getSudokuHint,
  pauseSudokuState,
  resumeSudokuState,
  sudokuDigits,
  tickSudokuTimer,
  type SudokuDigit,
} from "@puzzlehub/sudoku-engine";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
  type ColorSchemeName,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  defaultAppPreferences,
  loadAppPreferences,
  saveAppPreferences,
  type AppLanguagePreference,
  type AppPreferences,
  type AppThemePreference,
} from "./src/appPreferencesRepository";
import {
  acknowledgeSudokuConflicts,
  getOrCreateDeviceId,
  loadLocalSudokuProgress,
  loadSudokuSyncSummary,
  loadSavedSudokuGame,
  recordSudokuCompletion,
  recordSudokuMove,
  saveSudokuSnapshot,
  undoLastSudokuMove,
  type RecordSudokuCompletionResult,
  type RecordSudokuMoveInput,
} from "./src/sudokuRepository";
import type {
  LocalSudokuProgress,
  LocalSudokuPersonalRecords,
  SudokuAchievementId,
  SudokuMedal,
} from "./src/sudokuRewards";
import { sudokuAchievementIds } from "./src/sudokuRewards";
import { getSyncApiBaseUrl, startSudokuSync } from "./src/sudokuSync";
import type { SyncScheduler } from "./src/syncClient";
import {
  deriveSudokuSyncStatus,
  getSudokuCellUiState,
  getSudokuDigitUiState,
  type SudokuCellPosition,
} from "./src/sudokuUiModel";
import { getLocalDailySudokuDescriptor } from "./src/sudokuDaily";
import { usePuzzleHubI18n } from "./src/usePuzzleHubI18n";

const gameNameKeys = {
  block: "game.block",
  nonogram: "game.nonogram",
  sort: "game.sort",
  sudoku: "game.sudoku",
  word: "game.word",
} satisfies Record<(typeof gameCatalog)[number]["type"], TranslationKey>;

const iconButtonHitSlop = 8;
const isDevelopmentBuild = __DEV__;

const languagePreferenceOptions = [
  { value: "system", labelKey: "settings.systemDefault" },
  { value: "en", labelKey: "settings.english" },
  { value: "nb", labelKey: "settings.norwegian" },
] satisfies { value: AppLanguagePreference; labelKey: TranslationKey }[];

const themePreferenceOptions = [
  { value: "system", labelKey: "settings.systemDefault", icon: "phone-portrait-outline" },
  { value: "light", labelKey: "settings.light", icon: "sunny-outline" },
  { value: "dark", labelKey: "settings.dark", icon: "moon-outline" },
] satisfies {
  value: AppThemePreference;
  labelKey: TranslationKey;
  icon: keyof typeof Ionicons.glyphMap;
}[];

const medalLabelKeys = {
  bronze: "reward.bronze",
  gold: "reward.gold",
  silver: "reward.silver",
} satisfies Record<SudokuMedal, TranslationKey>;

const achievementLabelKeys = {
  first_daily: "achievement.first_daily",
  first_solve: "achievement.first_solve",
  hard_completed: "achievement.hard_completed",
  no_mistake_solve: "achievement.no_mistake_solve",
  streak_3: "achievement.streak_3",
  streak_7: "achievement.streak_7",
} satisfies Record<SudokuAchievementId, TranslationKey>;

type ResolvedTheme = "light" | "dark";

interface AppThemeColors {
  accent: string;
  accentContrast: string;
  activeGame: string;
  activeGameBorder: string;
  activeGameText: string;
  background: string;
  boardBorder: string;
  border: string;
  cell: string;
  cellRelated: string;
  cellSameDigit: string;
  error: string;
  givenCell: string;
  incorrectCell: string;
  modalBackdrop: string;
  note: string;
  offline: string;
  pauseOverlay: string;
  selectedCell: string;
  surface: string;
  surfaceMuted: string;
  text: string;
  textMuted: string;
  textSoft: string;
}

const appThemeColors: Record<ResolvedTheme, AppThemeColors> = {
  dark: {
    accent: "#32b8a7",
    accentContrast: "#ffffff",
    activeGame: "#d9b44a",
    activeGameBorder: "#a27d1f",
    activeGameText: "#151719",
    background: "#0f1213",
    boardBorder: "#e7ece9",
    border: "#344246",
    cell: "#101617",
    cellRelated: "#1d2a2d",
    cellSameDigit: "#2f4a41",
    error: "#f06f6c",
    givenCell: "#202b2f",
    incorrectCell: "#4a2428",
    modalBackdrop: "rgba(6, 8, 10, 0.64)",
    note: "#9aa9a8",
    offline: "#d9b44a",
    pauseOverlay: "rgba(16, 19, 21, 0.92)",
    selectedCell: "#255f58",
    surface: "#171d1f",
    surfaceMuted: "#20292c",
    text: "#f2f5f2",
    textMuted: "#aebbb7",
    textSoft: "#7f8d8a",
  },
  light: {
    accent: "#206f66",
    accentContrast: "#ffffff",
    activeGame: "#dfb84d",
    activeGameBorder: "#b58b24",
    activeGameText: "#19232a",
    background: "#f4f6f3",
    boardBorder: "#1b2a32",
    border: "#d6ded9",
    cell: "#ffffff",
    cellRelated: "#e6efeb",
    cellSameDigit: "#dcebd6",
    error: "#c3423f",
    givenCell: "#e7ece8",
    incorrectCell: "#f8d7d4",
    modalBackdrop: "rgba(25, 35, 42, 0.34)",
    note: "#60706d",
    offline: "#7f5f12",
    pauseOverlay: "rgba(244, 246, 243, 0.92)",
    selectedCell: "#bee7de",
    surface: "#ffffff",
    surfaceMuted: "#edf1ee",
    text: "#19232a",
    textMuted: "#566765",
    textSoft: "#72807b",
  },
};

const resolveThemePreference = (
  preference: AppThemePreference,
  systemColorScheme: ColorSchemeName,
): ResolvedTheme => {
  if (preference === "system") {
    return systemColorScheme === "dark" ? "dark" : "light";
  }

  return preference;
};

interface IncorrectCell extends SudokuCellPosition {
  id: number;
}

function triggerSelectionHaptic(): void {
  void Haptics.selectionAsync().catch(() => {
    // Haptics can be unavailable when the device disables the Taptic Engine.
  });
}

export default function App() {
  const systemColorScheme = useColorScheme();
  const [preferences, setPreferences] = useState<AppPreferences>(defaultAppPreferences);
  const { formatNumber, t } = usePuzzleHubI18n(preferences.language);
  const resolvedTheme = resolveThemePreference(preferences.theme, systemColorScheme);
  const colors = appThemeColors[resolvedTheme];
  const styles = useMemo(() => createStyles(colors), [colors]);
  const dailySudoku = useMemo(() => getLocalDailySudokuDescriptor(), []);
  const generated = useMemo(
    () => generateSudoku({ difficulty: dailySudoku.difficulty, seed: dailySudoku.seed }),
    [dailySudoku.difficulty, dailySudoku.seed],
  );
  const gameId = dailySudoku.gameId;
  const [state, setState] = useState(() => createInitialSudokuState(generated.puzzle));
  const [selectedCell, setSelectedCell] = useState<SudokuCellPosition | null>(null);
  const [incorrectCell, setIncorrectCell] = useState<IncorrectCell | null>(null);
  const [isNoteMode, setIsNoteMode] = useState(false);
  const [isCompletionVisible, setIsCompletionVisible] = useState(false);
  const [completionReward, setCompletionReward] = useState<RecordSudokuCompletionResult | null>(
    null,
  );
  const [localProgress, setLocalProgress] = useState<LocalSudokuProgress | null>(null);
  const [isProgressVisible, setIsProgressVisible] = useState(false);
  const [isGameMenuVisible, setIsGameMenuVisible] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [networkState, setNetworkState] = useState<NetInfoState | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [conflictSyncCount, setConflictSyncCount] = useState(0);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const isOffline =
    networkState?.isConnected === false || networkState?.isInternetReachable === false;
  const syncStatus = deriveSudokuSyncStatus({
    pendingCount: pendingSyncCount,
    conflictCount: conflictSyncCount,
    offline: isOffline,
  });
  const syncStatusText = t(syncStatus.messageKey, { count: syncStatus.count });
  const score = calculateSudokuScore({
    difficulty: generated.puzzle.difficulty,
    elapsedSeconds: state.elapsedSeconds,
    mistakes: state.mistakes,
    hintsUsed: state.hintsUsed,
  });
  const refreshLocalProgress = useCallback((): void => {
    void loadLocalSudokuProgress()
      .then((progress) => {
        setLocalProgress(progress);
        setStorageError(null);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.loadProgress"));
      });
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    void loadAppPreferences()
      .then((savedPreferences) => {
        if (!cancelled) {
          setPreferences(savedPreferences);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setStorageError(error instanceof Error ? error.message : "Could not load preferences.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function hydrateGame(): Promise<void> {
      try {
        const saved = await loadSavedSudokuGame(gameId);

        if (cancelled) {
          return;
        }

        if (saved !== null) {
          setState(saved.state);
        } else {
          await saveSudokuSnapshot({
            gameId,
            puzzle: generated.puzzle,
            state: createInitialSudokuState(generated.puzzle),
            action: "create",
          });
        }

        const [syncSummary, progress] = await Promise.all([
          loadSudokuSyncSummary(gameId),
          loadLocalSudokuProgress(),
        ]);

        if (!cancelled) {
          setPendingSyncCount(syncSummary.pendingCount);
          setConflictSyncCount(syncSummary.conflictCount);
          setLocalProgress(progress);
          setIsStorageReady(true);
          setStorageError(null);
        }
      } catch (error) {
        if (!cancelled) {
          setStorageError(error instanceof Error ? error.message : t("error.loadSavedGame"));
          setIsStorageReady(true);
        }
      }
    }

    void hydrateGame();

    return () => {
      cancelled = true;
    };
  }, [gameId, generated.puzzle, t]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((nextNetworkState) => {
      setNetworkState(nextNetworkState);
    });

    void NetInfo.fetch()
      .then((nextNetworkState) => {
        setNetworkState(nextNetworkState);
      })
      .catch(() => {
        setNetworkState(null);
      });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const apiBaseUrl = getSyncApiBaseUrl();

    if (apiBaseUrl === "") {
      // Sync stays local-only until an API base URL is configured.
      return;
    }

    let scheduler: SyncScheduler | null = null;
    let cancelled = false;

    void (async () => {
      const deviceId = await getOrCreateDeviceId();

      if (cancelled) {
        return;
      }

      scheduler = await startSudokuSync({ deviceId, apiBaseUrl });
    })();

    return () => {
      cancelled = true;
      scheduler?.stop();
    };
  }, []);

  useEffect(() => {
    if (incorrectCell === null) {
      return;
    }

    const timeout = setTimeout(() => {
      setIncorrectCell((current) => (current?.id === incorrectCell.id ? null : current));
    }, 700);

    return () => clearTimeout(timeout);
  }, [incorrectCell]);

  useEffect(() => {
    if (!isStorageReady || state.status !== "active") {
      return;
    }

    const interval = setInterval(() => {
      setState((current) => {
        const nextState = tickSudokuTimer(current);

        if (nextState !== current) {
          void saveSudokuSnapshot({
            gameId,
            puzzle: generated.puzzle,
            state: nextState,
            action: "create",
          })
            .then(() => {
              setStorageError(null);
            })
            .catch((error: unknown) => {
              setStorageError(error instanceof Error ? error.message : t("error.saveTimer"));
            });
        }

        return nextState;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [gameId, generated.puzzle, isStorageReady, state.status, t]);

  useEffect(() => {
    if (state.status === "completed") {
      setIsCompletionVisible(true);
    }
  }, [state.status]);

  useEffect(() => {
    if (!isStorageReady || state.status !== "completed" || state.completedAt === undefined) {
      return;
    }

    void recordSudokuCompletion({
      gameId,
      difficulty: generated.puzzle.difficulty,
      score: score.score,
      elapsedSeconds: state.elapsedSeconds,
      mistakes: state.mistakes,
      hintsUsed: state.hintsUsed,
      completedAt: state.completedAt,
      isDaily: true,
    })
      .then((reward) => {
        setCompletionReward(reward);
        refreshLocalProgress();
        setStorageError(null);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.saveCompletion"));
      });
  }, [
    gameId,
    generated.puzzle.difficulty,
    isStorageReady,
    score.score,
    state.completedAt,
    state.elapsedSeconds,
    state.hintsUsed,
    state.mistakes,
    state.status,
    refreshLocalProgress,
    t,
  ]);

  const refreshSyncSummary = (): void => {
    void loadSudokuSyncSummary(gameId)
      .then((summary) => {
        setPendingSyncCount(summary.pendingCount);
        setConflictSyncCount(summary.conflictCount);
        setStorageError(null);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.loadSyncStatus"));
      });
  };

  const dismissSyncConflicts = (): void => {
    void acknowledgeSudokuConflicts(gameId)
      .then(() => {
        setConflictSyncCount(0);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.loadSyncStatus"));
      });
  };

  const persistMove = (input: RecordSudokuMoveInput): void => {
    void recordSudokuMove(input)
      .then(() => {
        refreshSyncSummary();
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.saveMove"));
      });
  };

  const playDigit = (digit: SudokuDigit): void => {
    if (selectedCell === null || !isStorageReady || state.status !== "active") {
      return;
    }

    if (isNoteMode) {
      const move = {
        ...selectedCell,
        value: digit,
        mode: "note" as const,
      };
      const result = applySudokuMove(generated.puzzle, generated.solution, state, move);

      if (!result.accepted) {
        return;
      }

      setIncorrectCell(null);
      triggerSelectionHaptic();
      setState(result.state);
      persistMove({
        gameId,
        puzzle: generated.puzzle,
        nextState: result.state,
        move,
        accepted: result.accepted,
        action: "note",
      });
      return;
    }

    const result = applySudokuMove(generated.puzzle, generated.solution, state, {
      ...selectedCell,
      value: digit,
      mode: "answer",
    });

    setState(result.state);

    if (result.accepted) {
      const moveInput: RecordSudokuMoveInput = {
        gameId,
        puzzle: generated.puzzle,
        nextState: result.state,
        move: {
          ...selectedCell,
          value: digit,
          mode: "answer",
        },
        accepted: result.accepted,
        action: "answer",
      };

      if (result.correct !== undefined) {
        moveInput.correct = result.correct;
      }

      if (result.reason !== undefined) {
        moveInput.reason = result.reason;
      }

      persistMove(moveInput);
      triggerSelectionHaptic();
    }

    if (result.correct === false) {
      setIncorrectCell({
        ...selectedCell,
        id: Date.now(),
      });
      return;
    }

    setIncorrectCell(null);
  };

  const useHint = (): void => {
    if (!isStorageReady || state.status !== "active") {
      return;
    }

    const hint = getSudokuHint(generated.puzzle, generated.solution, state);

    if (hint === null) {
      return;
    }

    const result = applySudokuMove(generated.puzzle, generated.solution, state, hint.move);
    const nextState = {
      ...result.state,
      hintsUsed: result.state.hintsUsed + 1,
    };

    setSelectedCell({ row: hint.move.row, col: hint.move.col });
    setIncorrectCell(null);
    triggerSelectionHaptic();
    setState(nextState);

    if (result.accepted) {
      persistMove({
        gameId,
        puzzle: generated.puzzle,
        nextState,
        move: hint.move,
        accepted: result.accepted,
        correct: true,
        action: "hint",
      });
    }
  };

  const eraseSelectedCell = (): void => {
    if (selectedCell === null || !isStorageReady || state.status !== "active") {
      return;
    }

    const move = {
      ...selectedCell,
      value: null,
      mode: "answer" as const,
    };
    const result = applySudokuMove(generated.puzzle, generated.solution, state, move);

    if (!result.accepted) {
      return;
    }

    setIncorrectCell(null);
    triggerSelectionHaptic();
    setState(result.state);
    persistMove({
      gameId,
      puzzle: generated.puzzle,
      nextState: result.state,
      move,
      accepted: result.accepted,
      correct: true,
      action: "erase",
    });
  };

  const undoMove = (): void => {
    if (!isStorageReady || state.status !== "active") {
      return;
    }

    void undoLastSudokuMove({
      gameId,
      puzzle: generated.puzzle,
      initialState: createInitialSudokuState(generated.puzzle),
    })
      .then((result) => {
        if (!result.undone) {
          return;
        }

        setIncorrectCell(null);
        triggerSelectionHaptic();
        setState(result.state);
        refreshSyncSummary();
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.undoMove"));
      });
  };

  const restartGame = (): void => {
    const nextState = createInitialSudokuState(generated.puzzle);

    setIncorrectCell(null);
    setCompletionReward(null);
    setIsCompletionVisible(false);
    setIsSettingsVisible(false);
    setSelectedCell(null);
    setState(nextState);
    void saveSudokuSnapshot({
      gameId,
      puzzle: generated.puzzle,
      state: nextState,
      action: "reset",
    })
      .then(() => {
        refreshSyncSummary();
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.resetGame"));
      });
  };

  const togglePause = (): void => {
    if (!isStorageReady || state.status === "completed") {
      return;
    }

    const nextState =
      state.status === "paused" ? resumeSudokuState(state) : pauseSudokuState(state);

    setIncorrectCell(null);
    setState(nextState);
    void saveSudokuSnapshot({
      gameId,
      puzzle: generated.puzzle,
      state: nextState,
      action: "create",
    })
      .then(() => {
        setStorageError(null);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.savePauseState"));
      });
  };

  const updatePreferences = (nextPreferences: AppPreferences): void => {
    setPreferences(nextPreferences);
    void saveAppPreferences(nextPreferences)
      .then(() => {
        setStorageError(null);
      })
      .catch((error: unknown) => {
        setStorageError(error instanceof Error ? error.message : t("error.savePreferences"));
      });
  };

  const selectCell = (cell: SudokuCellPosition): void => {
    if (selectedCell?.row !== cell.row || selectedCell.col !== cell.col) {
      triggerSelectionHaptic();
    }
    setSelectedCell(cell);
  };

  const isInteractionEnabled = isStorageReady && state.status === "active";
  const selectedCellValue =
    selectedCell === null ? 0 : (state.grid[selectedCell.row]?.[selectedCell.col] ?? 0);
  const selectedCellNotes =
    selectedCell === null ? [] : (state.notes[selectedCell.row]?.[selectedCell.col] ?? []);
  const digitButtonStates = sudokuDigits.map((digit) =>
    getSudokuDigitUiState({
      digit,
      grid: state.grid,
      isNoteMode,
      selectedCellNotes,
      selectedCellValue,
    }),
  );
  const firstDigitRow = digitButtonStates.slice(0, 5);
  const secondDigitRow = digitButtonStates.slice(5);
  const personalRecordKeys =
    completionReward === null ? [] : getPersonalRecordKeys(completionReward.personalRecords);
  const unlockedAchievementKeys =
    completionReward?.unlockedAchievementIds.map(
      (achievementId) => achievementLabelKeys[achievementId],
    ) ?? [];
  const progressStats = localProgress?.stats ?? null;
  const progressAchievementIds = new Set(
    localProgress?.achievements.map((achievement) => achievement.achievementId) ?? [],
  );
  const progressStatItems = [
    {
      label: t("metric.games"),
      value: progressStats === null ? "..." : formatNumber(progressStats.gamesCompleted),
    },
    {
      label: t("metric.totalXp"),
      value: progressStats === null ? "..." : formatNumber(progressStats.totalXp),
    },
    {
      label: t("metric.bestScore"),
      value:
        progressStats === null
          ? "..."
          : progressStats.bestScore === null
            ? "-"
            : formatNumber(progressStats.bestScore),
    },
    {
      label: t("metric.bestTime"),
      value:
        progressStats === null
          ? "..."
          : progressStats.bestTimeSeconds === null
            ? "-"
            : formatElapsedTime(progressStats.bestTimeSeconds),
    },
    {
      label: t("metric.streak"),
      value: progressStats === null ? "..." : formatNumber(progressStats.currentStreak),
    },
    {
      label: t("metric.longestStreak"),
      value: progressStats === null ? "..." : formatNumber(progressStats.longestStreak),
    },
  ];
  const shouldShowStatusRow =
    isOffline ||
    storageError !== null ||
    !isStorageReady ||
    pendingSyncCount > 0 ||
    syncStatus.hasConflict;

  return (
    <SafeAreaProvider>
      <SafeAreaView edges={["top", "bottom", "left", "right"]} style={styles.screen}>
        <StatusBar style={resolvedTheme === "dark" ? "light" : "dark"} />
        <View style={styles.playSurface} testID="sudoku-screen">
          <View style={styles.gameHeader}>
            <View style={styles.topBar}>
              <View style={styles.titleBlock}>
                <Text style={styles.subtitle}>{t("app.brand")}</Text>
                <Text
                  adjustsFontSizeToFit
                  minimumFontScale={0.82}
                  numberOfLines={1}
                  style={styles.brand}
                >
                  {t("screen.dailySudoku")}
                </Text>
              </View>
              <View style={[styles.iconRow, isDevelopmentBuild && styles.developmentIconRow]}>
                <Pressable
                  accessibilityLabel="Toggle pause"
                  accessibilityRole="button"
                  accessibilityState={{
                    disabled: !isStorageReady || state.status === "completed",
                  }}
                  disabled={!isStorageReady || state.status === "completed"}
                  hitSlop={iconButtonHitSlop}
                  style={[styles.iconButton, !isStorageReady && styles.disabledControl]}
                  testID="sudoku-pause-toggle"
                  onPress={togglePause}
                >
                  <Ionicons
                    name={state.status === "paused" ? "play" : "pause"}
                    size={18}
                    color={colors.text}
                  />
                </Pressable>
                <Pressable
                  accessibilityLabel={t("screen.progress")}
                  accessibilityRole="button"
                  hitSlop={iconButtonHitSlop}
                  style={styles.iconButton}
                  testID="sudoku-progress-open"
                  onPress={() => setIsProgressVisible(true)}
                >
                  <Ionicons name="trophy-outline" size={18} color={colors.text} />
                </Pressable>
                <Pressable
                  accessibilityLabel={t("settings.title")}
                  accessibilityRole="button"
                  hitSlop={iconButtonHitSlop}
                  style={styles.iconButton}
                  testID="sudoku-settings-open"
                  onPress={() => setIsSettingsVisible(true)}
                >
                  <Ionicons name="settings-outline" size={18} color={colors.text} />
                </Pressable>
              </View>
            </View>

            <View style={styles.statsRow}>
              <Metric styles={styles} label={t("metric.score")} value={formatNumber(score.score)} />
              <Metric
                styles={styles}
                label={t("metric.time")}
                value={formatElapsedTime(state.elapsedSeconds)}
              />
              <Metric
                styles={styles}
                label={t("metric.mistakes")}
                value={formatNumber(state.mistakes)}
              />
              <Metric
                styles={styles}
                label={t("metric.hints")}
                value={formatNumber(state.hintsUsed)}
              />
            </View>

            {shouldShowStatusRow && (
              <View style={styles.statusRow}>
                {isOffline && (
                  <View style={styles.statusChip}>
                    <Ionicons name="cloud-offline-outline" size={14} color={colors.offline} />
                    <Text style={styles.offlineText}>{t("status.offline")}</Text>
                  </View>
                )}
                <View style={styles.statusChip}>
                  <Ionicons
                    name={storageError === null ? "phone-portrait-outline" : "alert-circle-outline"}
                    size={14}
                    color={storageError === null ? colors.accent : colors.error}
                  />
                  <Text
                    style={[styles.storageText, storageError !== null && styles.storageErrorText]}
                  >
                    {storageError ?? (isStorageReady ? t("status.local") : t("status.loading"))}
                  </Text>
                </View>
                {(pendingSyncCount > 0 || syncStatus.hasConflict) && (
                  <View style={styles.statusChip}>
                    <Ionicons
                      name={pendingSyncCount === 0 ? "cloud-done-outline" : "cloud-upload-outline"}
                      size={14}
                      color={pendingSyncCount === 0 ? colors.accent : colors.textMuted}
                    />
                    <Text style={styles.storageText}>{syncStatusText}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {syncStatus.hasConflict && (
            <View style={styles.conflictBanner} testID="sudoku-conflict-banner">
              <Ionicons name="git-compare-outline" size={16} color={colors.error} />
              <Text style={styles.conflictText}>{t("conflict.banner")}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={dismissSyncConflicts}
                style={styles.conflictDismiss}
                testID="sudoku-conflict-dismiss"
              >
                <Text style={styles.conflictDismissText}>{t("conflict.dismiss")}</Text>
              </Pressable>
            </View>
          )}

          <View style={styles.boardShell}>
            <View style={styles.board} testID="sudoku-board">
              {state.status === "paused" && (
                <View style={styles.pauseOverlay}>
                  <Ionicons name="pause-circle" size={40} color={colors.text} />
                  <Text style={styles.pauseText}>{t("screen.paused")}</Text>
                </View>
              )}
              {generated.puzzle.grid.map((row, rowIndex) =>
                row.map((_, colIndex) => {
                  const value = state.grid[rowIndex]?.[colIndex] ?? 0;
                  const notes = state.notes[rowIndex]?.[colIndex] ?? [];
                  const cellUiState = getSudokuCellUiState({
                    col: colIndex,
                    givens: generated.puzzle.givens,
                    grid: state.grid,
                    incorrectCell,
                    row: rowIndex,
                    selectedCell,
                  });
                  return (
                    <Pressable
                      accessibilityLabel={cellUiState.accessibilityLabel}
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: !isInteractionEnabled,
                        selected: cellUiState.isSelected,
                      }}
                      key={`${rowIndex}-${colIndex}`}
                      style={[
                        styles.cell,
                        cellUiState.isGiven && styles.givenCell,
                        cellUiState.isRelated && styles.relatedCell,
                        cellUiState.isSameDigit && styles.sameDigitCell,
                        cellUiState.isSelected && styles.selectedCell,
                        cellUiState.isIncorrect && styles.incorrectCell,
                        colIndex % 3 === 2 && colIndex !== 8 && styles.boxRight,
                        rowIndex % 3 === 2 && rowIndex !== 8 && styles.boxBottom,
                      ]}
                      disabled={!isInteractionEnabled}
                      testID={cellUiState.testID}
                      onPress={() => selectCell({ row: rowIndex, col: colIndex })}
                    >
                      {value === 0 ? (
                        <NoteGrid styles={styles} notes={notes} />
                      ) : (
                        <Text style={[styles.cellText, cellUiState.isGiven && styles.givenText]}>
                          {value}
                        </Text>
                      )}
                      {cellUiState.isIncorrect && (
                        <View style={styles.incorrectBadge}>
                          <Ionicons name="alert" size={10} color={colors.accentContrast} />
                        </View>
                      )}
                    </Pressable>
                  );
                }),
              )}
            </View>
          </View>

          <View style={styles.controlDeck}>
            <View style={styles.inputModeRow}>
              <Pressable
                accessibilityLabel={t("mode.answer")}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isInteractionEnabled, selected: !isNoteMode }}
                disabled={!isInteractionEnabled}
                style={[
                  styles.modeButton,
                  !isNoteMode && styles.activeModeButton,
                  !isInteractionEnabled && styles.disabledControl,
                ]}
                testID="sudoku-mode-answer"
                onPress={() => setIsNoteMode(false)}
              >
                <Ionicons
                  name="keypad-outline"
                  size={16}
                  color={isNoteMode ? colors.textMuted : colors.accentContrast}
                />
                <Text style={[styles.modeButtonText, !isNoteMode && styles.activeModeButtonText]}>
                  {t("mode.answer")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t("mode.notes")}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isInteractionEnabled, selected: isNoteMode }}
                disabled={!isInteractionEnabled}
                style={[
                  styles.modeButton,
                  isNoteMode && styles.activeModeButton,
                  !isInteractionEnabled && styles.disabledControl,
                ]}
                testID="sudoku-mode-notes"
                onPress={() => setIsNoteMode(true)}
              >
                <Ionicons
                  name="pencil-outline"
                  size={16}
                  color={isNoteMode ? colors.accentContrast : colors.textMuted}
                />
                <Text style={[styles.modeButtonText, isNoteMode && styles.activeModeButtonText]}>
                  {t("mode.notes")}
                </Text>
              </Pressable>
            </View>

            <View style={styles.numberPad}>
              {[firstDigitRow, secondDigitRow].map((row, rowIndex) => (
                <View key={rowIndex} style={styles.numberPadRow}>
                  {row.map(({ accessibilityLabel, digit, isActiveDigit, isComplete, testID }) => {
                    return (
                      <Pressable
                        accessibilityLabel={accessibilityLabel}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: !isInteractionEnabled || isComplete,
                          selected: isActiveDigit,
                        }}
                        disabled={!isInteractionEnabled || isComplete}
                        key={digit}
                        style={[
                          styles.numberButton,
                          isActiveDigit && styles.activeNumberButton,
                          isComplete && styles.completeNumberButton,
                          (!isInteractionEnabled || isComplete) && styles.disabledControl,
                        ]}
                        testID={testID}
                        onPress={() => playDigit(digit)}
                      >
                        <Text style={[styles.numberText, isActiveDigit && styles.activeNumberText]}>
                          {digit}
                        </Text>
                        {isActiveDigit && <View style={styles.numberActiveIndicator} />}
                      </Pressable>
                    );
                  })}
                  {rowIndex === 1 && (
                    <Pressable
                      accessibilityLabel={t("action.erase")}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: !isInteractionEnabled }}
                      disabled={!isInteractionEnabled}
                      style={[
                        styles.numberButton,
                        styles.numberActionButton,
                        !isInteractionEnabled && styles.disabledControl,
                      ]}
                      testID="sudoku-action-erase"
                      onPress={eraseSelectedCell}
                    >
                      <Ionicons name="backspace-outline" size={22} color={colors.text} />
                    </Pressable>
                  )}
                </View>
              ))}
            </View>

            <View style={styles.actionRow}>
              <Pressable
                accessibilityLabel={t("action.hint")}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isInteractionEnabled }}
                disabled={!isInteractionEnabled}
                style={[styles.primaryButton, !isInteractionEnabled && styles.disabledControl]}
                testID="sudoku-action-hint"
                onPress={useHint}
              >
                <Ionicons name="sparkles-outline" size={18} color={colors.accentContrast} />
                <Text style={styles.primaryButtonText}>{t("action.hint")}</Text>
              </Pressable>
              <Pressable
                accessibilityLabel={t("action.undo")}
                accessibilityRole="button"
                accessibilityState={{ disabled: !isInteractionEnabled }}
                disabled={!isInteractionEnabled}
                style={[styles.secondaryButton, !isInteractionEnabled && styles.disabledControl]}
                testID="sudoku-action-undo"
                onPress={undoMove}
              >
                <Ionicons name="arrow-undo-outline" size={18} color={colors.text} />
                <Text style={styles.secondaryButtonText}>{t("action.undo")}</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <Modal
          animationType="fade"
          transparent
          visible={isCompletionVisible}
          onRequestClose={() => setIsCompletionVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.completionModal} testID="sudoku-completion-modal">
              <Ionicons name="checkmark-circle" size={44} color={colors.accent} />
              <Text style={styles.completionTitle}>{t("modal.completed")}</Text>
              <View style={styles.completionStats}>
                <CompletionStat
                  styles={styles}
                  label={t("metric.score")}
                  value={formatNumber(score.score)}
                />
                <CompletionStat
                  styles={styles}
                  label={t("metric.time")}
                  value={formatElapsedTime(state.elapsedSeconds)}
                />
                <CompletionStat
                  styles={styles}
                  label={t("metric.mistakes")}
                  value={formatNumber(state.mistakes)}
                />
                <CompletionStat
                  styles={styles}
                  label={t("metric.hints")}
                  value={formatNumber(state.hintsUsed)}
                />
                <CompletionStat
                  styles={styles}
                  label={t("metric.xp")}
                  value={
                    completionReward === null
                      ? "..."
                      : `+${formatNumber(completionReward.completion.xp)}`
                  }
                />
                <CompletionStat
                  styles={styles}
                  label={t("metric.medal")}
                  value={
                    completionReward === null
                      ? "..."
                      : t(medalLabelKeys[completionReward.completion.medal])
                  }
                />
                <CompletionStat
                  styles={styles}
                  label={t("metric.streak")}
                  value={
                    completionReward === null
                      ? "..."
                      : formatNumber(completionReward.stats.currentStreak)
                  }
                />
              </View>
              {(personalRecordKeys.length > 0 || unlockedAchievementKeys.length > 0) && (
                <View style={styles.rewardPanel}>
                  {personalRecordKeys.length > 0 && (
                    <RewardGroup
                      label={t("reward.personalRecords")}
                      items={personalRecordKeys.map((key) => t(key))}
                      styles={styles}
                    />
                  )}
                  {unlockedAchievementKeys.length > 0 && (
                    <RewardGroup
                      label={t("reward.achievements")}
                      items={unlockedAchievementKeys.map((key) => t(key))}
                      styles={styles}
                    />
                  )}
                </View>
              )}
              <View style={styles.modalActions}>
                <Pressable
                  accessibilityRole="button"
                  style={styles.modalPrimaryButton}
                  testID="sudoku-completion-restart"
                  onPress={restartGame}
                >
                  <Ionicons name="refresh" size={18} color={colors.accentContrast} />
                  <Text style={styles.modalPrimaryButtonText}>{t("action.restart")}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  style={styles.modalSecondaryButton}
                  testID="sudoku-completion-close"
                  onPress={() => setIsCompletionVisible(false)}
                >
                  <Text style={styles.modalSecondaryButtonText}>{t("action.close")}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={isProgressVisible}
          onRequestClose={() => setIsProgressVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View
              style={[styles.gameMenuModal, styles.progressModal]}
              testID="sudoku-progress-modal"
            >
              <View style={styles.progressTitleRow}>
                <Text style={styles.gameMenuTitle}>{t("screen.progress")}</Text>
                <View style={styles.progressCountChip}>
                  <Ionicons name="ribbon-outline" size={15} color={colors.accent} />
                  <Text style={styles.progressCountText}>
                    {formatNumber(progressAchievementIds.size)}/
                    {formatNumber(sudokuAchievementIds.length)}
                  </Text>
                </View>
              </View>
              <ScrollView
                contentContainerStyle={styles.progressScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.completionStats}>
                  {progressStatItems.map((item) => (
                    <CompletionStat
                      key={item.label}
                      styles={styles}
                      label={item.label}
                      value={item.value}
                    />
                  ))}
                </View>
                <View style={styles.progressSection}>
                  <Text style={styles.settingsSectionTitle}>{t("reward.achievements")}</Text>
                  <View style={styles.progressAchievementList}>
                    {sudokuAchievementIds.map((achievementId) => {
                      const isUnlocked = progressAchievementIds.has(achievementId);

                      return (
                        <View
                          key={achievementId}
                          style={[
                            styles.progressAchievementItem,
                            !isUnlocked && styles.lockedProgressAchievementItem,
                          ]}
                        >
                          <Ionicons
                            name={isUnlocked ? "checkmark-circle" : "lock-closed-outline"}
                            size={18}
                            color={isUnlocked ? colors.accent : colors.textSoft}
                          />
                          <Text
                            style={[
                              styles.progressAchievementText,
                              !isUnlocked && styles.lockedProgressAchievementText,
                            ]}
                          >
                            {t(achievementLabelKeys[achievementId])}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </View>
              </ScrollView>
              <Pressable
                accessibilityRole="button"
                style={styles.modalSecondaryButton}
                testID="sudoku-progress-close"
                onPress={() => setIsProgressVisible(false)}
              >
                <Text style={styles.modalSecondaryButtonText}>{t("action.close")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={isSettingsVisible}
          onRequestClose={() => setIsSettingsVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.gameMenuModal} testID="sudoku-settings-modal">
              <Text style={styles.gameMenuTitle}>{t("settings.title")}</Text>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t("settings.language")}</Text>
                <View style={styles.segmentedControl}>
                  {languagePreferenceOptions.map((option) => {
                    const isActive = preferences.language === option.value;

                    return (
                      <Pressable
                        accessibilityLabel={t(option.labelKey)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        key={option.value}
                        style={[styles.segmentedOption, isActive && styles.activeSegmentedOption]}
                        testID={`sudoku-settings-language-${option.value}`}
                        onPress={() =>
                          updatePreferences({
                            ...preferences,
                            language: option.value,
                          })
                        }
                      >
                        <Text
                          adjustsFontSizeToFit
                          minimumFontScale={0.78}
                          numberOfLines={1}
                          style={[
                            styles.segmentedOptionText,
                            isActive && styles.activeSegmentedOptionText,
                          ]}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsSectionTitle}>{t("settings.appearance")}</Text>
                <View style={styles.segmentedControl}>
                  {themePreferenceOptions.map((option) => {
                    const isActive = preferences.theme === option.value;

                    return (
                      <Pressable
                        accessibilityLabel={t(option.labelKey)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                        key={option.value}
                        style={[styles.segmentedOption, isActive && styles.activeSegmentedOption]}
                        testID={`sudoku-settings-theme-${option.value}`}
                        onPress={() =>
                          updatePreferences({
                            ...preferences,
                            theme: option.value,
                          })
                        }
                      >
                        <Ionicons
                          name={option.icon}
                          size={16}
                          color={isActive ? colors.accentContrast : colors.textMuted}
                        />
                        <Text
                          adjustsFontSizeToFit
                          minimumFontScale={0.78}
                          numberOfLines={1}
                          style={[
                            styles.segmentedOptionText,
                            isActive && styles.activeSegmentedOptionText,
                          ]}
                        >
                          {t(option.labelKey)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: !isStorageReady }}
                disabled={!isStorageReady}
                style={[styles.gameMenuItem, !isStorageReady && styles.disabledGameMenuItem]}
                testID="sudoku-settings-restart"
                onPress={restartGame}
              >
                <Text style={styles.gameMenuItemText}>{t("settings.restartPuzzle")}</Text>
                <Ionicons name="refresh" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityLabel={t("games.title")}
                accessibilityRole="button"
                style={styles.gameMenuItem}
                testID="sudoku-settings-games"
                onPress={() => {
                  setIsSettingsVisible(false);
                  setIsGameMenuVisible(true);
                }}
              >
                <Text style={styles.gameMenuItemText}>{t("games.title")}</Text>
                <Ionicons name="grid-outline" size={18} color={colors.text} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.modalSecondaryButton}
                testID="sudoku-settings-close"
                onPress={() => setIsSettingsVisible(false)}
              >
                <Text style={styles.modalSecondaryButtonText}>{t("action.close")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
        <Modal
          animationType="fade"
          transparent
          visible={isGameMenuVisible}
          onRequestClose={() => setIsGameMenuVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.gameMenuModal} testID="sudoku-game-menu-modal">
              <Text style={styles.gameMenuTitle}>{t("games.title")}</Text>
              <View style={styles.gameMenuList}>
                {gameCatalog.map((game) => {
                  const isActiveGame = game.type === "sudoku";
                  const isPlayable = game.status === "mvp";

                  return (
                    <Pressable
                      accessibilityLabel={t(gameNameKeys[game.type])}
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: !isPlayable,
                        selected: isActiveGame,
                      }}
                      disabled={!isPlayable}
                      key={game.type}
                      style={[
                        styles.gameMenuItem,
                        isActiveGame && styles.activeGameMenuItem,
                        !isPlayable && styles.disabledGameMenuItem,
                      ]}
                      testID={`sudoku-game-menu-${game.type}`}
                      onPress={() => setIsGameMenuVisible(false)}
                    >
                      <Text
                        style={[
                          styles.gameMenuItemText,
                          isActiveGame && styles.activeGameMenuItemText,
                        ]}
                      >
                        {t(gameNameKeys[game.type])}
                      </Text>
                      {isActiveGame && <Ionicons name="checkmark" size={18} color={colors.text} />}
                    </Pressable>
                  );
                })}
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.modalSecondaryButton}
                testID="sudoku-game-menu-close"
                onPress={() => setIsGameMenuVisible(false)}
              >
                <Text style={styles.modalSecondaryButtonText}>{t("action.close")}</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

type AppStyleSheet = ReturnType<typeof createStyles>;

function Metric({ label, styles, value }: { label: string; styles: AppStyleSheet; value: string }) {
  return (
    <View style={styles.metric}>
      <Text
        style={styles.metricValue}
        adjustsFontSizeToFit
        minimumFontScale={0.65}
        numberOfLines={1}
      >
        {value}
      </Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function CompletionStat({
  label,
  styles,
  value,
}: {
  label: string;
  styles: AppStyleSheet;
  value: string;
}) {
  return (
    <View style={styles.completionStat}>
      <Text style={styles.completionStatValue}>{value}</Text>
      <Text style={styles.completionStatLabel}>{label}</Text>
    </View>
  );
}

function RewardGroup({
  items,
  label,
  styles,
}: {
  items: string[];
  label: string;
  styles: AppStyleSheet;
}) {
  return (
    <View style={styles.rewardGroup}>
      <Text style={styles.rewardGroupLabel}>{label}</Text>
      <View style={styles.rewardChipRow}>
        {items.map((item) => (
          <View key={item} style={styles.rewardChip}>
            <Text style={styles.rewardChipText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function NoteGrid({ notes, styles }: { notes: SudokuDigit[]; styles: AppStyleSheet }) {
  if (notes.length === 0) {
    return null;
  }

  return (
    <View style={styles.noteGrid}>
      {sudokuDigits.map((digit) => (
        <View key={digit} style={styles.noteSlot}>
          <Text style={styles.noteText}>{notes.includes(digit) ? digit : ""}</Text>
        </View>
      ))}
    </View>
  );
}

function formatElapsedTime(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function getPersonalRecordKeys(records: LocalSudokuPersonalRecords): TranslationKey[] {
  const keys: TranslationKey[] = [];

  if (records.firstCompletion) {
    keys.push("reward.firstCompletion");
  }

  if (records.newBestScore) {
    keys.push("reward.newBestScore");
  }

  if (records.newBestTime) {
    keys.push("reward.newBestTime");
  }

  if (records.flawless) {
    keys.push("reward.flawless");
  }

  if (records.newLongestStreak) {
    keys.push("reward.newLongestStreak");
  }

  return keys;
}

function createStyles(colors: AppThemeColors) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: colors.background,
    },
    playSurface: {
      flex: 1,
      gap: 9,
      justifyContent: "space-between",
      paddingBottom: 12,
      paddingHorizontal: 18,
      paddingTop: 8,
    },
    gameHeader: {
      gap: 7,
    },
    topBar: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
      paddingRight: 12,
    },
    brand: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "800",
      letterSpacing: 0,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 0,
      textTransform: "uppercase",
    },
    iconRow: {
      flexDirection: "row",
      gap: 6,
    },
    developmentIconRow: {
      marginRight: 82,
    },
    iconButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      height: 30,
      justifyContent: "center",
      width: 30,
    },
    statsRow: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.surfaceMuted,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 5,
    },
    statusRow: {
      alignItems: "center",
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      minHeight: 20,
    },
    statusChip: {
      alignItems: "center",
      flexDirection: "row",
      gap: 4,
    },
    conflictBanner: {
      alignItems: "center",
      backgroundColor: colors.error + "22",
      borderRadius: 10,
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    conflictText: {
      color: colors.error,
      flex: 1,
      fontSize: 12,
      fontWeight: "700",
    },
    conflictDismiss: {
      borderColor: colors.error,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    conflictDismissText: {
      color: colors.error,
      fontSize: 12,
      fontWeight: "800",
    },
    offlineText: {
      color: colors.offline,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0,
    },
    storageText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "700",
      letterSpacing: 0,
    },
    storageErrorText: {
      color: colors.error,
    },
    metric: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 31,
    },
    metricValue: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 0,
    },
    metricLabel: {
      color: colors.textSoft,
      fontSize: 9,
      fontWeight: "700",
      marginTop: 1,
    },
    boardShell: {
      alignItems: "center",
      flex: 1,
      justifyContent: "center",
      minHeight: 0,
      width: "100%",
    },
    board: {
      alignSelf: "center",
      aspectRatio: 1,
      backgroundColor: colors.boardBorder,
      borderColor: colors.boardBorder,
      borderRadius: 8,
      borderWidth: 2,
      flexDirection: "row",
      flexWrap: "wrap",
      overflow: "hidden",
      position: "relative",
      width: "100%",
    },
    pauseOverlay: {
      alignItems: "center",
      backgroundColor: colors.pauseOverlay,
      bottom: 0,
      gap: 8,
      justifyContent: "center",
      left: 0,
      position: "absolute",
      right: 0,
      top: 0,
      zIndex: 10,
    },
    pauseText: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0,
    },
    cell: {
      alignItems: "center",
      backgroundColor: colors.cell,
      borderColor: colors.border,
      borderWidth: StyleSheet.hairlineWidth,
      height: "11.111%",
      justifyContent: "center",
      position: "relative",
      width: "11.111%",
    },
    givenCell: {
      backgroundColor: colors.givenCell,
    },
    relatedCell: {
      backgroundColor: colors.cellRelated,
    },
    sameDigitCell: {
      backgroundColor: colors.cellSameDigit,
    },
    selectedCell: {
      backgroundColor: colors.selectedCell,
      borderColor: colors.accent,
      borderWidth: 1,
    },
    incorrectCell: {
      backgroundColor: colors.incorrectCell,
    },
    incorrectBadge: {
      alignItems: "center",
      backgroundColor: colors.error,
      borderRadius: 8,
      height: 16,
      justifyContent: "center",
      position: "absolute",
      right: 3,
      top: 3,
      width: 16,
    },
    boxRight: {
      borderRightColor: colors.boardBorder,
      borderRightWidth: 2,
    },
    boxBottom: {
      borderBottomColor: colors.boardBorder,
      borderBottomWidth: 2,
    },
    cellText: {
      color: colors.accent,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 0,
    },
    givenText: {
      color: colors.text,
    },
    noteGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      height: "100%",
      padding: 2,
      width: "100%",
    },
    noteSlot: {
      alignItems: "center",
      height: "33.333%",
      justifyContent: "center",
      width: "33.333%",
    },
    noteText: {
      color: colors.note,
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0,
      lineHeight: 9,
    },
    controlDeck: {
      gap: 8,
      paddingHorizontal: 0,
      width: "100%",
    },
    inputModeRow: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      padding: 3,
    },
    modeButton: {
      alignItems: "center",
      borderRadius: 6,
      flex: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minHeight: 34,
    },
    activeModeButton: {
      backgroundColor: colors.accent,
    },
    modeButtonText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0,
    },
    activeModeButtonText: {
      color: colors.accentContrast,
    },
    numberPad: {
      gap: 6,
    },
    numberPadRow: {
      flexDirection: "row",
      gap: 6,
    },
    numberButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 46,
      position: "relative",
    },
    activeNumberButton: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.accent,
    },
    numberActionButton: {
      backgroundColor: colors.surfaceMuted,
    },
    completeNumberButton: {
      backgroundColor: colors.surfaceMuted,
    },
    disabledControl: {
      opacity: 0.45,
    },
    numberText: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0,
      lineHeight: 21,
    },
    activeNumberText: {
      color: colors.accent,
    },
    numberActiveIndicator: {
      backgroundColor: colors.accent,
      borderRadius: 2,
      bottom: 7,
      height: 3,
      position: "absolute",
      width: 16,
    },
    actionRow: {
      flexDirection: "row",
      gap: 8,
      width: "100%",
    },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 8,
      flex: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minWidth: 0,
      minHeight: 42,
      paddingHorizontal: 4,
    },
    primaryButtonText: {
      color: colors.accentContrast,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
    },
    secondaryButton: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      flexDirection: "row",
      gap: 6,
      justifyContent: "center",
      minWidth: 0,
      minHeight: 42,
      paddingHorizontal: 4,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0,
    },
    modalBackdrop: {
      alignItems: "center",
      backgroundColor: colors.modalBackdrop,
      flex: 1,
      justifyContent: "center",
      padding: 20,
    },
    completionModal: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 12,
      maxWidth: 360,
      padding: 18,
      width: "100%",
    },
    completionTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 0,
    },
    completionStats: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
      width: "100%",
    },
    completionStat: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: 8,
      flexBasis: "47%",
      flexGrow: 1,
      paddingHorizontal: 10,
      paddingVertical: 9,
    },
    completionStatValue: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      letterSpacing: 0,
    },
    completionStatLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0,
      marginTop: 2,
    },
    rewardPanel: {
      gap: 10,
      width: "100%",
    },
    rewardGroup: {
      gap: 6,
      width: "100%",
    },
    rewardGroupLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
    },
    rewardChipRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    rewardChip: {
      backgroundColor: colors.cellSameDigit,
      borderColor: colors.accent,
      borderRadius: 8,
      borderWidth: 1,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    rewardChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
    },
    modalActions: {
      flexDirection: "row",
      gap: 10,
      width: "100%",
    },
    modalPrimaryButton: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 8,
      flex: 1,
      flexDirection: "row",
      gap: 8,
      justifyContent: "center",
      minHeight: 44,
    },
    modalPrimaryButtonText: {
      color: colors.accentContrast,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 0,
    },
    modalSecondaryButton: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flex: 1,
      justifyContent: "center",
      minHeight: 44,
    },
    modalSecondaryButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 0,
    },
    gameMenuModal: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      gap: 14,
      maxWidth: 360,
      padding: 18,
      width: "100%",
    },
    gameMenuTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 0,
    },
    progressModal: {
      maxHeight: "86%",
    },
    progressTitleRow: {
      alignItems: "center",
      flexDirection: "row",
      justifyContent: "space-between",
      gap: 12,
    },
    progressCountChip: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 5,
      paddingHorizontal: 9,
      paddingVertical: 5,
    },
    progressCountText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
    },
    progressScrollContent: {
      gap: 14,
      paddingBottom: 2,
    },
    progressSection: {
      gap: 8,
    },
    progressAchievementList: {
      gap: 8,
    },
    progressAchievementItem: {
      alignItems: "center",
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 9,
      minHeight: 42,
      paddingHorizontal: 10,
    },
    lockedProgressAchievementItem: {
      opacity: 0.58,
    },
    progressAchievementText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: "800",
      letterSpacing: 0,
    },
    lockedProgressAchievementText: {
      color: colors.textMuted,
    },
    gameMenuList: {
      gap: 8,
    },
    gameMenuItem: {
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      minHeight: 44,
      paddingHorizontal: 12,
    },
    activeGameMenuItem: {
      backgroundColor: colors.activeGame,
      borderColor: colors.activeGameBorder,
    },
    disabledGameMenuItem: {
      opacity: 0.55,
    },
    gameMenuItemText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: "800",
      letterSpacing: 0,
    },
    activeGameMenuItemText: {
      color: colors.activeGameText,
    },
    settingsSection: {
      gap: 8,
    },
    settingsSectionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 0,
    },
    segmentedControl: {
      backgroundColor: colors.surfaceMuted,
      borderColor: colors.border,
      borderRadius: 8,
      borderWidth: 1,
      flexDirection: "row",
      gap: 4,
      padding: 4,
    },
    segmentedOption: {
      alignItems: "center",
      borderRadius: 6,
      flex: 1,
      flexDirection: "row",
      gap: 4,
      justifyContent: "center",
      minHeight: 34,
      minWidth: 0,
      paddingHorizontal: 4,
    },
    activeSegmentedOption: {
      backgroundColor: colors.accent,
    },
    segmentedOptionText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "800",
      letterSpacing: 0,
    },
    activeSegmentedOptionText: {
      color: colors.accentContrast,
    },
  });
}
