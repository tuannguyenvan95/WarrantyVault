import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Icons } from './utils';

describe('Icons', () => {
  describe('Wallet', () => {
    it('renders without crashing', () => {
      render(<Icons.Wallet />);
    });

    it('renders with custom props', () => {
      render(<Icons.Wallet data-testid="wallet-icon" className="custom-class" />);
      const icon = screen.getByTestId('wallet-icon');
      expect(icon).toBeInTheDocument();
      expect(icon).toHaveClass('custom-class');
    });

    it('renders SVG element', () => {
      render(<Icons.Wallet />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('xmlns', 'http://www.w3.org/2000/svg');
    });
  });

  describe('Brain', () => {
    it('renders without crashing', () => {
      render(<Icons.Brain />);
    });

    it('renders with custom props', () => {
      render(<Icons.Brain data-testid="brain-icon" />);
      expect(screen.getByTestId('brain-icon')).toBeInTheDocument();
    });
  });

  describe('Shield', () => {
    it('renders without crashing', () => {
      render(<Icons.Shield />);
    });

    it('renders with custom props', () => {
      render(<Icons.Shield data-testid="shield-icon" />);
      expect(screen.getByTestId('shield-icon')).toBeInTheDocument();
    });
  });

  describe('Check', () => {
    it('renders without crashing', () => {
      render(<Icons.Check />);
    });

    it('renders with custom props', () => {
      render(<Icons.Check data-testid="check-icon" />);
      expect(screen.getByTestId('check-icon')).toBeInTheDocument();
    });
  });

  describe('ExternalLink', () => {
    it('renders without crashing', () => {
      render(<Icons.ExternalLink />);
    });

    it('renders with custom props', () => {
      render(<Icons.ExternalLink data-testid="external-link-icon" />);
      expect(screen.getByTestId('external-link-icon')).toBeInTheDocument();
    });
  });

  describe('AlertTriangle', () => {
    it('renders without crashing', () => {
      render(<Icons.AlertTriangle />);
    });

    it('renders with custom props', () => {
      render(<Icons.AlertTriangle data-testid="alert-icon" />);
      expect(screen.getByTestId('alert-icon')).toBeInTheDocument();
    });
  });

  describe('All Icons', () => {
    const iconNames = Object.keys(Icons) as (keyof typeof Icons)[];

    it('exports all expected icons', () => {
      expect(iconNames).toContain('Wallet');
      expect(iconNames).toContain('Brain');
      expect(iconNames).toContain('Shield');
      expect(iconNames).toContain('Check');
      expect(iconNames).toContain('ExternalLink');
      expect(iconNames).toContain('AlertTriangle');
    });

    it('all icons render SVG elements', () => {
      iconNames.forEach((name) => {
        const { unmount } = render(React.createElement(Icons[name]));
        const svg = document.querySelector('svg');
        expect(svg).toBeInTheDocument();
        unmount();
      });
    });

    it('all icons accept width and height props', () => {
      iconNames.forEach((name) => {
        const { unmount } = render(
          React.createElement(Icons[name], { width: 32, height: 32, 'data-testid': `${name}-icon` })
        );
        const icon = screen.getByTestId(`${name}-icon`);
        expect(icon).toBeInTheDocument();
        unmount();
      });
    });
  });
});
