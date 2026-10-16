import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getByText } from '@testing-library/dom';
import { initApp } from '../../src/ui/app.js';
import { fakeClassify, fakeFile, mountAppMarkup } from '../helpers.js';

function chooseFolder(files) {
  const input = document.getElementById('folder-input');
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  input.dispatchEvent(new Event('change'));
}
const status = () => document.getElementById('status');

let onSelect, app;
beforeEach(() => {
  mountAppMarkup();
  onSelect = vi.fn();
  app = initApp(document, { classify: fakeClassify, onSelect });
});
afterEach(() => app.destroy());

describe('open folder button', () => {
  it('opens the (hidden) folder picker, so it works from the keyboard', () => {
    const input = document.getElementById('folder-input');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    document.getElementById('open-folder').click();
    expect(click).toHaveBeenCalledOnce();
  });
});

describe('open folder → browse → select (critical flow)', () => {
  it('renders the chosen folder and reports counts', () => {
    chooseFolder([fakeFile('Mix/01.mp3'), fakeFile('Mix/02.ogg'), fakeFile('Mix/cover.jpg', 'image/jpeg')]);
    expect(document.querySelector('#tree summary').textContent).toBe('Mix');
    expect(status().textContent).toBe('1 playable track · 1 unsupported · 1 other file');
  });

  it('selecting a track passes the file node to onSelect', () => {
    chooseFolder([fakeFile('Mix/01.mp3')]);
    getByText(document.body, '01.mp3').click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ path: 'Mix/01.mp3', type: 'file' }));
  });

  it('counts protected files and treats them as audio', () => {
    chooseFolder([fakeFile('Old/a.m4p'), fakeFile('Old/b.m4p')]);
    expect(status().textContent).toBe('0 playable tracks · 2 protected');
  });

  it('says so when a folder has no audio', () => {
    chooseFolder([fakeFile('Docs/readme.txt')]);
    expect(status().textContent).toBe('No audio files found in this folder.');
    expect(document.querySelector('#tree li.other')).not.toBeNull();
  });

  it('handles an empty folder (only hidden files)', () => {
    chooseFolder([fakeFile('Empty/.DS_Store')]);
    expect(status().textContent).toBe('That folder is empty.');
    expect(document.getElementById('tree').children.length).toBe(0);
  });

  it('replaces the tree when another folder is opened', () => {
    chooseFolder([fakeFile('One/a.mp3')]);
    chooseFolder([fakeFile('Two/b.mp3')]);
    expect([...document.querySelectorAll('#tree summary')].map((s) => s.textContent)).toEqual(['Two']);
  });
});

describe('drag and drop', () => {
  const drop = (dataTransfer) => {
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    ev.dataTransfer = dataTransfer;
    document.getElementById('drop-zone').dispatchEvent(ev);
    return ev;
  };
  const fileEntry = (fullPath) => ({
    isFile: true, fullPath, name: fullPath.split('/').pop(), file: (ok) => ok({ name: fullPath.split('/').pop(), type: '' }),
  });

  it('renders dropped files and prevents the browser from opening them', async () => {
    const ev = drop({ items: [{ kind: 'file', webkitGetAsEntry: () => fileEntry('/dropped.mp3') }] });
    expect(ev.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(status().textContent).toBe('1 playable track'));
    expect(getByText(document.body, 'dropped.mp3').tagName).toBe('BUTTON');
  });

  it('shows an error state if reading fails', async () => {
    drop({ get items() { throw new Error('boom'); } });
    await vi.waitFor(() => expect(status().textContent).toBe('Could not read the dropped items: boom'));
    expect(status().classList.contains('error')).toBe(true);
  });

  it('accepts drops outside the drop zone instead of letting the browser open the file', async () => {
    const ev = new Event('drop', { bubbles: true, cancelable: true });
    ev.dataTransfer = { items: [{ kind: 'file', webkitGetAsEntry: () => fileEntry('/elsewhere.mp3') }] };
    document.body.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(status().textContent).toBe('1 playable track'));
  });

  it('toggles the dragging highlight', () => {
    const zone = document.getElementById('drop-zone');
    zone.dispatchEvent(new Event('dragenter', { bubbles: true }));
    expect(zone.classList.contains('dragging')).toBe(true);
    zone.dispatchEvent(new Event('dragleave', { bubbles: true }));
    expect(zone.classList.contains('dragging')).toBe(false);
  });
});
