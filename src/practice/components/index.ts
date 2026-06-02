// Barrel re-export for shell-shared primitives + iOS frame components.
// Lets shells `import { Bajla, IOSDevice, ... } from '@/components'` instead of
// reaching into individual files.

export * from './primitives';
export * from './ios-frame';
export * from './InterferenceTip';
export * from './ExpandableInstructions';
export * from './SessionModal';
