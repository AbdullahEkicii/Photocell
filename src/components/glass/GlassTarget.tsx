import React, { createContext, useContext, useRef } from 'react';
import { Platform, View, StyleProp, ViewStyle } from 'react-native';
import { BlurTargetView } from 'expo-blur';

/**
 * On Android, a BlurView can only blur what sits inside a registered "blur target",
 * and the BlurView itself must live outside it. The app wraps its screens in
 * <GlassTarget> and draws the glass tab bar as a sibling, with a <GlassTargetProvider>
 * above both, so content really does scroll beneath live blur. iOS blurs the backdrop
 * natively and needs no target.
 */
type TargetRef = React.RefObject<View | null> | null;
const GlassTargetContext = createContext<TargetRef>(null);

/** The ref a BlurView passes as `blurTarget`; null on platforms that don't need one. */
export const useGlassTarget = (): TargetRef => useContext(GlassTargetContext);

export const GlassTargetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const ref = useRef<View>(null);
  return (
    <GlassTargetContext.Provider value={Platform.OS === 'android' ? ref : null}>
      {children}
    </GlassTargetContext.Provider>
  );
};

/** Wraps the content that glass should blur. */
export const GlassTarget: React.FC<{ style?: StyleProp<ViewStyle>; children: React.ReactNode }> = ({
  style,
  children,
}) => {
  const ref = useGlassTarget();
  if (!ref) return <View style={style}>{children}</View>;
  return (
    <BlurTargetView ref={ref} style={style}>
      {children}
    </BlurTargetView>
  );
};
