import { describe, expect, test } from 'bun:test';
import { normalizeCliText } from '../src/web/src/lib/utils';

describe('normalizeCliText', () => {
  test('replaces macOS em-dashes (—) with double hyphens (--)', () => {
    const input = 'docker run -i —rm -e KEY=VALUE ghcr.io/org/image:latest';
    expect(normalizeCliText(input)).toBe('docker run -i --rm -e KEY=VALUE ghcr.io/org/image:latest');
  });

  test('replaces macOS en-dashes (–) with hyphens (-)', () => {
    const input = 'docker run –i ––rm node';
    expect(normalizeCliText(input)).toBe('docker run -i --rm node');
  });

  test('replaces macOS smart quotes with straight quotes', () => {
    const input = 'npx -y “@modelcontextprotocol/server-filesystem” ‘/data’';
    expect(normalizeCliText(input)).toBe('npx -y "@modelcontextprotocol/server-filesystem" \'/data\'');
  });

  test('handles clean input without changes', () => {
    const input = 'npx -y --package @modelcontextprotocol/server-filesystem /data';
    expect(normalizeCliText(input)).toBe('npx -y --package @modelcontextprotocol/server-filesystem /data');
  });

  test('handles empty or null string gracefully', () => {
    expect(normalizeCliText('')).toBe('');
  });
});
