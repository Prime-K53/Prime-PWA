import { describe, it, expect } from 'vitest';
import { FormulaEngine } from '../../services/formulaEngine';

describe('FormulaEngine AST Evaluator', () => {
  const engine = new FormulaEngine();

  describe('basic arithmetic', () => {
    it('should evaluate simple addition', () => {
      const result = engine.evaluate('2 + 3', {});
      expect(result).toBe(5);
    });

    it('should evaluate subtraction', () => {
      const result = engine.evaluate('10 - 4', {});
      expect(result).toBe(6);
    });

    it('should evaluate multiplication', () => {
      const result = engine.evaluate('6 * 7', {});
      expect(result).toBe(42);
    });

    it('should evaluate division', () => {
      const result = engine.evaluate('20 / 4', {});
      expect(result).toBe(5);
    });

    it('should handle operator precedence', () => {
      const result = engine.evaluate('2 + 3 * 4', {});
      expect(result).toBe(14);
    });

    it('should handle parentheses', () => {
      const result = engine.evaluate('(2 + 3) * 4', {});
      expect(result).toBe(20);
    });

    it('should handle decimal numbers', () => {
      const result = engine.evaluate('3.14 * 2', {});
      expect(result).toBeCloseTo(6.28, 2);
    });
  });

  describe('Math functions', () => {
    it('should evaluate Math.ceil', () => {
      const result = engine.evaluate('Math.ceil(4.2)', {});
      expect(result).toBe(5);
    });

    it('should evaluate Math.floor', () => {
      const result = engine.evaluate('Math.floor(4.8)', {});
      expect(result).toBe(4);
    });

    it('should evaluate Math.round', () => {
      const result = engine.evaluate('Math.round(4.5)', {});
      expect(result).toBe(5);
    });

    it('should evaluate Math.min', () => {
      const result = engine.evaluate('Math.min(5, 3, 8)', {});
      expect(result).toBe(3);
    });

    it('should evaluate Math.max', () => {
      const result = engine.evaluate('Math.max(5, 3, 8)', {});
      expect(result).toBe(8);
    });

    it('should evaluate Math.abs', () => {
      const result = engine.evaluate('Math.abs(-5)', {});
      expect(result).toBe(5);
    });

    it('should evaluate Math.sqrt', () => {
      const result = engine.evaluate('Math.sqrt(16)', {});
      expect(result).toBe(4);
    });

    it('should evaluate Math.pow', () => {
      const result = engine.evaluate('Math.pow(2, 3)', {});
      expect(result).toBe(8);
    });
  });

  describe('context variables', () => {
    it('should substitute variables from context', () => {
      const result = engine.evaluate('price * quantity', { price: 10, quantity: 3 });
      expect(result).toBe(30);
    });

    it('should handle multiple variables', () => {
      const result = engine.evaluate('(price + cost) * quantity', { price: 10, cost: 5, quantity: 2 });
      expect(result).toBe(30);
    });

    it('should treat missing variables as zero', () => {
      const result = engine.evaluate('price * quantity', {});
      expect(result).toBe(0);
    });
  });

  describe('security validation', () => {
    it('should reject formulas with disallowed characters', () => {
      expect(() => engine.evaluate('alert("hacked")', {})).toThrow('Invalid characters');
    });

    it('should reject formulas with string operations', () => {
      expect(() => engine.evaluate('"hello" + "world"', {})).toThrow('Invalid characters');
    });

    it('should reject formulas with logical operators', () => {
      expect(() => engine.evaluate('5 > 3', {})).toThrow('Invalid characters');
    });
  });

  describe('complex expressions', () => {
    it('should handle nested Math functions', () => {
      const result = engine.evaluate('Math.round(Math.sqrt(20) * 10)', {});
      expect(result).toBe(45);
    });

    it('should handle mixed arithmetic and Math functions', () => {
      const result = engine.evaluate('Math.ceil(5.2) + Math.floor(5.8) * 2', {});
      expect(result).toBe(17);
    });
  });
});
