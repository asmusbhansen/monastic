import { snapshot, floating, returnCard, animateBoard } from './card-motion.js';

class FitGameBoard extends HTMLElement {
    fitTo(table) {
        this.observer?.disconnect();
        this.listeners?.abort();
        this.listeners = new AbortController();
        const fit = () => {
            const measure = layout => {
                table.dataset.layout = layout;
                return Math.min(this.clientWidth / table.offsetWidth, this.clientHeight / table.offsetHeight);
            };
            const beside = measure('beside');
            const stacked = measure('stacked');
            const scale = Math.max(beside, stacked);
            if (beside >= stacked) table.dataset.layout = 'beside';
            if (scale > 0) table.style.setProperty('--board-scale', scale);
        };
        this.observer = new ResizeObserver(fit);
        this.observer.observe(this);
        this.observer.observe(table);
        window.addEventListener('resize', fit, { signal: this.listeners.signal });
        document.addEventListener('visibilitychange', fit, { signal: this.listeners.signal });
        fit();
    }
    disconnectedCallback() { this.observer?.disconnect(); this.listeners?.abort(); }
}
if (!customElements.get('fit-game-board')) customElements.define('fit-game-board', FitGameBoard);

export function attach(board, dotnet) {
    board.parentElement.fitTo(board);
    let source, targets, version, pointer, x, y, grabX, grabY, ghost, before;
    const zone = e => e?.closest('[data-zone]');
    function clear() {
        ghost?.remove();
        board.querySelectorAll('.drag-source,.drop-target').forEach(e => e.classList.remove('drag-source', 'drop-target'));
        source = pointer = ghost = null;
    }
    function start(el) {
        if (before || !el?.dataset.drops) return false;
        source = el;
        version = Number(board.dataset.version);
        targets = el.dataset.drops.split(' ');
        source.classList.add('drag-source');
        for (const target of board.querySelectorAll('[data-zone]'))
            if (targets.includes(target.dataset.zone)) target.classList.add('drop-target');
        return true;
    }
    function finish(el) {
        while (el && !targets.includes(el.dataset.zone)) el = zone(el.parentElement);
        const from = source.dataset.zone, to = el?.dataset.zone;
        if (!to) { cancel(); return; }
        pointer = null;
        before = snapshot(board);
        if (ghost && before.visible.has(from)) before.visible.get(from).rect = ghost.getBoundingClientRect();
        dotnet.invokeMethodAsync('Drop', from, to, version).then(accepted => {
            if (!accepted) { before = null; cancel(); }
        }).catch(error => { before = null; cancel(); console.error('Could not submit card drop', error); });
    }
    function cancel() {
        if (ghost && source) {
            returnCard(ghost, source.getBoundingClientRect());
            ghost = null;
        }
        clear();
    }
    board.addEventListener('click', e => {
        if (e.target.closest('.instruction button')) before ??= snapshot(board);
    }, true);
    const observer = new MutationObserver(() => {
        const first = before;
        before = null;
        clear();
        if (first) animateBoard(board, first);
    });
    observer.observe(board, { attributes: true, attributeFilter: ['data-version'] });
    function placeGhost() {
        ghost.style.left = `${x - grabX}px`;
        ghost.style.top = `${y - grabY}px`;
    }
    board.addEventListener('pointerdown', e => {
        if (!e.isPrimary || e.button !== 0 || before) return;
        clear();
        if (!start(zone(e.target))) return;
        e.preventDefault();
        pointer = e.pointerId;
        board.setPointerCapture(pointer);
        const rect = source.getBoundingClientRect();
        x = e.clientX; y = e.clientY;
        grabX = x - rect.left; grabY = y - rect.top;
        ghost = floating(source, rect);
        ghost.classList.add('held-card');
        placeGhost();
    });
    board.addEventListener('pointermove', e => {
        if (pointer !== e.pointerId) return;
        x = e.clientX; y = e.clientY;
        placeGhost();
    });
    board.addEventListener('pointerup', e => {
        if (pointer === e.pointerId) finish(zone(document.elementFromPoint(e.clientX, e.clientY)));
    });
    board.addEventListener('pointercancel', cancel);
    board.addEventListener('keydown', e => {
        if (before) return;
        if (e.key === 'Escape') cancel();
        if (!['Enter', ' '].includes(e.key) || !e.target.hasAttribute('data-zone')) return;
        e.preventDefault();
        if (source) finish(zone(e.target)); else start(zone(e.target));
    });
}
