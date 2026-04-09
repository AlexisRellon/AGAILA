import React from 'react';
import { render } from '@testing-library/react';
import App from './App';

test('renders GAIA header', () => {
  const { getByText } = render(<App />);
  const headerElement = getByText(/GAIA: Geospatial AI-driven Assessment/i);
  expect(headerElement).toBeInTheDocument();
});

test('renders welcome message', () => {
  const { getByText } = render(<App />);
  const welcomeElement = getByText(/Welcome to GAIA/i);
  expect(welcomeElement).toBeInTheDocument();
});