// History management for undo/redo (max 25 states per module)
const historyManager = {
  script: { past: [], future: [] },
  wristband: { past: [], future: [] },
  tendencies: { past: [], future: [] },
  callsheet: { past: [], future: [] },
  maxHistory: 25,

  saveState(type, state) {
    const history = this[type];
    const stateCopy = safeDeepClone(state);
    history.past.push(stateCopy);
    history.future = [];
    if (history.past.length > this.maxHistory) {
      history.past.shift();
    }
    this.updateButtons(type);
  },

  undo(type, currentState) {
    const history = this[type];
    if (history.past.length === 0) return null;

    history.future.push(safeDeepClone(currentState));
    const previousState = history.past.pop();
    this.updateButtons(type);
    return previousState;
  },

  redo(type, currentState) {
    const history = this[type];
    if (history.future.length === 0) return null;

    history.past.push(safeDeepClone(currentState));
    const futureState = history.future.pop();
    this.updateButtons(type);
    return futureState;
  },

  clear(type) {
    this[type].past = [];
    this[type].future = [];
    this.updateButtons(type);
  },

  updateButtons(type) {
    const history = this[type];
    const undoBtn = document.getElementById(`${type}UndoBtn`);
    const redoBtn = document.getElementById(`${type}RedoBtn`);

    if (undoBtn) {
      undoBtn.disabled = history.past.length === 0;
      undoBtn.title =
        history.past.length > 0
          ? `Undo (${history.past.length})`
          : "Nothing to undo";
    }
    if (redoBtn) {
      redoBtn.disabled = history.future.length === 0;
      redoBtn.title =
        history.future.length > 0
          ? `Redo (${history.future.length})`
          : "Nothing to redo";
    }
  },

  canUndo(type) {
    return this[type].past.length > 0;
  },

  canRedo(type) {
    return this[type].future.length > 0;
  },
};