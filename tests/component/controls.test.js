import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getByLabelText } from '@testing-library/dom';
import { renderControls } from '../../src/ui/controls.js';

const base = { track: null, playing: false, currentTime: 0, duration: NaN, volume: 1, muted: false, error: null };
const loaded = { ...base, track: { name: '01 Intro.mp3', path: 'Music/Album/01 Intro.mp3' }, duration: 125, currentTime: 7 };

let el, actions, controls;
beforeEach(() => {
  document.body.innerHTML = '<footer id="p"></footer>';
  el = document.getElementById('p');
  actions = { toggle: vi.fn(), prev: vi.fn(), next: vi.fn(), seek: vi.fn(), setVolume: vi.fn(), toggleMute: vi.fn() };
  controls = renderControls(el, actions);
});

describe('renderControls', () => {
  it('starts disabled with no track', () => {
    controls.update(base);
    expect(getByLabelText(el, 'Play').disabled).toBe(true);
    expect(getByLabelText(el, 'Next track').disabled).toBe(true);
    expect(getByLabelText(el, 'Seek').disabled).toBe(true);
    expect(el.querySelector('.title').textContent).toBe('No track selected');
    expect(el.querySelector('.duration').textContent).toBe('--:--');
  });

  it('shows the track, its folder and times', () => {
    controls.update(loaded, { hasPrev: false, hasNext: true });
    expect(el.querySelector('.title').textContent).toBe('01 Intro');
    expect(el.querySelector('.title').title).toBe('01 Intro.mp3');
    expect(el.querySelector('.folder').textContent).toBe('Music/Album');
    expect(el.querySelector('.elapsed').textContent).toBe('0:07');
    expect(el.querySelector('.duration').textContent).toBe('2:05');
    expect(getByLabelText(el, 'Seek').max).toBe('125');
    expect(getByLabelText(el, 'Next track').disabled).toBe(false);
  });

  it('switches the play button label and icon with state', () => {
    controls.update({ ...loaded, playing: true });
    const btn = el.querySelector('.play');
    expect(btn.getAttribute('aria-label')).toBe('Pause');
    controls.update({ ...loaded, playing: false });
    expect(btn.getAttribute('aria-label')).toBe('Play');
  });

  it('routes button clicks to actions', () => {
    controls.update(loaded, { hasPrev: true, hasNext: true });
    el.querySelector('.play').click();
    getByLabelText(el, 'Previous track').click();
    getByLabelText(el, 'Next track').click();
    getByLabelText(el, 'Mute').click();
    expect(actions.toggle).toHaveBeenCalled();
    expect(actions.prev).toHaveBeenCalled();
    expect(actions.next).toHaveBeenCalled();
    expect(actions.toggleMute).toHaveBeenCalled();
  });

  it('previews while scrubbing and seeks on release, ignoring timeupdates meanwhile', () => {
    controls.update(loaded);
    const seek = getByLabelText(el, 'Seek');
    seek.value = '60';
    seek.dispatchEvent(new Event('input'));
    expect(el.querySelector('.elapsed').textContent).toBe('1:00');
    controls.update({ ...loaded, currentTime: 8 }); // timeupdate mid-drag
    expect(seek.value).toBe('60');
    seek.dispatchEvent(new Event('change'));
    expect(actions.seek).toHaveBeenCalledWith(60);
  });

  it('sets volume from the slider and reflects mute', () => {
    controls.update(loaded);
    const vol = getByLabelText(el, 'Volume');
    vol.value = '0.5';
    vol.dispatchEvent(new Event('input'));
    expect(actions.setVolume).toHaveBeenCalledWith(0.5);
    controls.update({ ...loaded, muted: true });
    const mute = el.querySelector('.mute');
    expect(mute.getAttribute('aria-label')).toBe('Unmute');
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(vol.value).toBe('0');
  });

  it('gives sliders readable values for screen readers', () => {
    controls.update({ ...loaded, volume: 0.5 });
    expect(getByLabelText(el, 'Seek').getAttribute('aria-valuetext')).toBe('0:07 of 2:05');
    expect(getByLabelText(el, 'Volume').getAttribute('aria-valuetext')).toBe('50%');
    controls.update({ ...loaded, muted: true });
    expect(getByLabelText(el, 'Volume').getAttribute('aria-valuetext')).toBe('Muted');
  });

  it('hides the volume slider where volume is fixed (iOS)', () => {
    document.body.innerHTML = '<footer id="q"></footer>';
    const q = document.getElementById('q');
    renderControls(q, actions, { volumeAdjustable: false });
    expect(q.querySelector('.vol').hidden).toBe(true);
  });

  it('shows errors', () => {
    controls.update({ ...loaded, error: 'Could not play this file.' });
    expect(el.querySelector('[role=alert]').textContent).toBe('Could not play this file.');
  });
});
