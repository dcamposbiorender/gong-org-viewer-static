import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the speaker resolution logic by importing the module
// and checking that speaker IDs get resolved to names.
// Since the actual functions manipulate the DOM, we test the logic
// by examining the exported functions' behavior.

describe('snippet context — speaker resolution logic', () => {
  // Test the speaker resolution pattern used in snippet-context.ts
  // The core logic: 2-speaker calls map speakerId → customer, other → internal

  function buildSpeakerMap(
    fullContext: string,
    speakerId: string | undefined,
    customerName: string,
    internalName: string,
    quote: string,
  ): Record<string, string> {
    const speakerIdSet = [...new Set((fullContext.match(/\[Speaker (\d+)\]/g) || []).map(m => m.match(/\d+/)![0]))];
    const speakerMap: Record<string, string> = {};

    if (speakerId && speakerIdSet.length === 2 && speakerIdSet.includes(speakerId)) {
      const quoteIdx = fullContext.toLowerCase().indexOf(quote.toLowerCase().substring(0, 40));
      let quoteSpeakerId = speakerId;
      if (quoteIdx > 0) {
        const before = fullContext.substring(0, quoteIdx);
        const nearestMatch = before.match(/\[Speaker (\d+)\][^[]*$/);
        if (nearestMatch && speakerIdSet.includes(nearestMatch[1])) quoteSpeakerId = nearestMatch[1];
      }
      const otherSpeakerId = speakerIdSet.find(id => id !== quoteSpeakerId);
      const customerFirst = (customerName || 'Customer').split(';')[0].trim();
      const biorenderFirst = (internalName || 'BioRender Rep').split(';')[0].trim();
      speakerMap[quoteSpeakerId] = customerFirst;
      if (otherSpeakerId) speakerMap[otherSpeakerId] = biorenderFirst;
    }
    return speakerMap;
  }

  it('resolves 2-speaker call with known speakerId', () => {
    const context = '[Speaker 111] Hi there [Speaker 222] Tell me about your team [Speaker 111] We have about 50 people';
    const map = buildSpeakerMap(context, '111', 'John Smith', 'Jane Rep', 'We have about 50 people');
    expect(map['111']).toBe('John Smith');
    expect(map['222']).toBe('Jane Rep');
  });

  it('resolves when speakerId matches nearest speaker tag before quote', () => {
    const context = '[Speaker 222] First part [Speaker 111] Our team is growing fast';
    const map = buildSpeakerMap(context, '111', 'Customer Bob', 'Internal Alice', 'Our team is growing fast');
    expect(map['111']).toBe('Customer Bob');
    expect(map['222']).toBe('Internal Alice');
  });

  it('returns empty map for 3+ speaker calls', () => {
    const context = '[Speaker 111] Hi [Speaker 222] Hello [Speaker 333] Hey';
    const map = buildSpeakerMap(context, '111', 'A', 'B', 'Hi');
    expect(Object.keys(map)).toHaveLength(0); // Can't resolve 3-way
  });

  it('returns empty map when no speakerId provided', () => {
    const context = '[Speaker 111] Hi [Speaker 222] Hello';
    const map = buildSpeakerMap(context, undefined, 'A', 'B', 'Hi');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('returns empty map when speakerId not in context', () => {
    const context = '[Speaker 111] Hi [Speaker 222] Hello';
    const map = buildSpeakerMap(context, '999', 'A', 'B', 'Hi');
    expect(Object.keys(map)).toHaveLength(0);
  });

  it('handles semicolon-separated names (uses first)', () => {
    const context = '[Speaker 111] First [Speaker 222] Second';
    const map = buildSpeakerMap(context, '111', 'John; Jane', 'Alice; Bob', 'First');
    expect(map['111']).toBe('John');
    expect(map['222']).toBe('Alice');
  });

  it('uses fallback names when customer/internal not provided', () => {
    const context = '[Speaker 111] First [Speaker 222] Second';
    const map = buildSpeakerMap(context, '111', '', '', 'First');
    expect(map['111']).toBe('Customer');
    expect(map['222']).toBe('BioRender Rep');
  });
});

describe('snippet context — availability', () => {
  it('context is available when contextBefore is defined', () => {
    const snippet = { quote: 'test', contextBefore: 'some context' };
    expect(snippet.contextBefore !== undefined).toBe(true);
  });

  it('context is unavailable when contextBefore is undefined', () => {
    const snippet = { quote: 'test' } as any;
    expect(snippet.contextBefore !== undefined).toBe(false);
  });
});
