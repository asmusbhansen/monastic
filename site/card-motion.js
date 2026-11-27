const reduced = () => document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches;

// Physical copies, not definition IDs: two identical fronts can move independently.
export function snapshot(board) {
    const visible = new Map(), hidden = new Map();
    for (const el of board.querySelectorAll('[data-contains]')) {
        const rect = (el.hidden ? el.parentElement : el).getBoundingClientRect();
        for (const id of el.dataset.contains.split(' ').filter(Boolean)) hidden.set(`card-${id}`, rect);
    }
    for (const el of board.querySelectorAll('.play-card[data-zone]')) {
        visible.set(el.dataset.zone, { rect: el.getBoundingClientRect(), face: el.querySelector('.card-back') !== null,
            artwork: el.cloneNode(true), el });
    }
    return { visible, hidden, deck: board.querySelector('.draw-pile').getBoundingClientRect() };
}

export function floating(el, rect) {
    const copy = el.cloneNode(true);
    copy.inert = true;
    copy.setAttribute('aria-hidden', 'true');
    copy.classList.remove('drag-source', 'drop-target');
    copy.classList.add('floating-card');
    copy.style.setProperty('--w', `${rect.width}px`);
    Object.assign(copy.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
    document.body.append(copy);
    return copy;
}

function offset(from, to, parentScale = 1) {
    return `translate(${(from.left - to.left) / parentScale}px, ${(from.top - to.top) / parentScale}px) scale(${from.width / to.width}, ${from.height / to.height})`;
}

const timing = { duration: 340, easing: 'cubic-bezier(.2,.75,.25,1)' };

export function returnCard(copy, home) {
    if (!copy || reduced()) { copy?.remove(); return; }
    const from = copy.getBoundingClientRect();
    copy.style.left = `${home.left}px`;
    copy.style.top = `${home.top}px`;
    copy.style.transform = '';
    const animation = copy.animate([{ transform: offset(from, home) }, { transform: 'none' }], timing);
    animation.onfinish = animation.oncancel = () => copy.remove();
}

export function animateBoard(board, before) {
    if (reduced()) return;
    const after = snapshot(board);
    const deals = [...board.querySelectorAll('[data-deal]')];
    const dealt = new Set(deals.map(el => el.dataset.deal));
    const river = board.querySelector('.river-grid').children;
    // A flush may deal several distinct cards into the same position in one render.
    const duration = Math.max(100, Math.min(430, 1200 / Math.max(1, deals.length)));
    deals.forEach((template, i) => {
        const slot = river[Number(template.dataset.slot)].lastElementChild;
        const to = slot.getBoundingClientRect();
        const flight = document.createElement('div');
        flight.className = 'deal-flight';
        flight.inert = true;
        flight.setAttribute('aria-hidden', 'true');
        Object.assign(flight.style, { left:`${to.left}px`, top:`${to.top}px`, width:`${to.width}px`, height:`${to.height}px` });
        flight.style.setProperty('--w', `${to.width}px`);
        const [back, front] = [...template.children].map(el => el.cloneNode(true));
        flight.append(back, front);
        document.body.append(flight);
        const options = { duration, delay:i * duration, easing:timing.easing, fill:'both' };
        const travel = flight.animate([{ transform:offset(before.deck, to), opacity:0 },
            { opacity:1, offset:.035 }, { transform:'none', opacity:1 }], options);
        back.animate([{ transform:'perspective(700px) rotateY(0deg)' }, { transform:'perspective(700px) rotateY(180deg)' }], options);
        front.animate([{ transform:'perspective(700px) rotateY(-180deg)' }, { transform:'perspective(700px) rotateY(0deg)' }], options);
        travel.onfinish = travel.oncancel = () => flight.remove();
        if (slot.dataset.zone === template.dataset.deal)
            slot.animate([{ opacity:0 }, { opacity:0 }], { duration:(i+1)*duration });
    });
    for (const [id, last] of after.visible) {
        if (dealt.has(id) && last.el.closest('.river-grid')) continue;
        const previous = before.visible.get(id);
        const first = previous?.rect ?? before.hidden.get(id) ?? before.deck;
        const delta = offset(first, last.rect, parseFloat(board.style.getPropertyValue('--board-scale')) || 1);
        if (Math.abs(first.left - last.rect.left) + Math.abs(first.top - last.rect.top)
                + Math.abs(first.width - last.rect.width) > 1) {
            last.el.animate([{ transform: delta, zIndex: 3 }, { transform: 'none', zIndex: 3 }], timing);
        }
        if (previous && previous.face !== last.face) {
            last.el.firstElementChild.animate([{ transform: 'perspective(600px) rotateY(85deg)' },
                { transform: 'none' }], timing);
        }
    }
    for (const [id, old] of before.visible) {
        if (after.visible.has(id)) continue;
        const to = after.hidden.get(id) ?? after.deck;
        const copy = floating(old.artwork, old.rect);
        const animation = copy.animate([{ transform: 'none' }, { transform: offset(to, old.rect), opacity: 0 }], timing);
        animation.onfinish = animation.oncancel = () => copy.remove();
    }
}
