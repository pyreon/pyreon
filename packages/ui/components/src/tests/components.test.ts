import { initTestConfig } from '@pyreon/test-utils'
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  Center,
  CloseButton,
  Divider,
  Group,
  IconButton,
  Paragraph,
  Stack,
  Title,
} from '../index'

let cleanup: () => void
beforeAll(() => {
  cleanup = initTestConfig()
})
afterAll(() => cleanup())

describe('Layout components', () => {
  it('Box is a rocketstyle component', () => {
    expect(typeof Box).toBe('function')
    expect(Box.IS_ROCKETSTYLE).toBe(true)
  })

  it('Stack is a rocketstyle component', () => {
    expect(typeof Stack).toBe('function')
    expect(Stack.IS_ROCKETSTYLE).toBe(true)
  })

  it('Group is a rocketstyle component', () => {
    expect(typeof Group).toBe('function')
    expect(Group.IS_ROCKETSTYLE).toBe(true)
  })

  it('Center is a rocketstyle component', () => {
    expect(typeof Center).toBe('function')
    expect(Center.IS_ROCKETSTYLE).toBe(true)
  })

  it('Divider is a rocketstyle component', () => {
    expect(typeof Divider).toBe('function')
    expect(Divider.IS_ROCKETSTYLE).toBe(true)
  })
})

describe('Typography components', () => {
  it('Title is a rocketstyle component', () => {
    expect(typeof Title).toBe('function')
    expect(Title.IS_ROCKETSTYLE).toBe(true)
  })

  it('Paragraph is a rocketstyle component', () => {
    expect(typeof Paragraph).toBe('function')
    expect(Paragraph.IS_ROCKETSTYLE).toBe(true)
  })
})

describe('Button components', () => {
  it('Button is a rocketstyle component', () => {
    expect(typeof Button).toBe('function')
    expect(Button.IS_ROCKETSTYLE).toBe(true)
  })

  it('IconButton is a rocketstyle component', () => {
    expect(typeof IconButton).toBe('function')
    expect(IconButton.IS_ROCKETSTYLE).toBe(true)
  })

  it('CloseButton is a rocketstyle component', () => {
    expect(typeof CloseButton).toBe('function')
    expect(CloseButton.IS_ROCKETSTYLE).toBe(true)
  })
})

describe('Data display components', () => {
  it('Badge is a rocketstyle component', () => {
    expect(typeof Badge).toBe('function')
    expect(Badge.IS_ROCKETSTYLE).toBe(true)
  })

  it('Card is a rocketstyle component', () => {
    expect(typeof Card).toBe('function')
    expect(Card.IS_ROCKETSTYLE).toBe(true)
  })
})

describe('Feedback components', () => {
  it('Alert is a rocketstyle component', () => {
    expect(typeof Alert).toBe('function')
    expect(Alert.IS_ROCKETSTYLE).toBe(true)
  })
})

describe('All components have displayName', () => {
  const components = { Box, Stack, Group, Center, Divider, Title, Paragraph, Button, IconButton, CloseButton, Badge, Card, Alert }

  for (const [name, comp] of Object.entries(components)) {
    it(`${name} has displayName`, () => {
      expect(comp.displayName).toBe(name)
    })
  }
})
