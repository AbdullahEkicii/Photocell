# R8 Obfuscation & Google Play Store Mapping Configuration for PhotoCell / FotoSil

# Enable Mapping File Generation for Google Play Console Stack Trace Symbolication
-printmapping mapping.txt
-keepattributes SourceFile,LineNumberTable,Signature,InnerClasses,EnclosingMethod,Exceptions,Annotation

# React Native & Hermes Rules
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }
-keep class com.facebook.jni.** { *; }

# React Native Reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Shopify React Native Skia
-keep class com.shopify.reactnative.skia.** { *; }

# Expo SDK & Native Modules
-keep class expo.modules.** { *; }
-keep class expo.modules.medialibrary.** { *; }
-keep class expo.modules.filesystem.** { *; }

# Native UI & Vector Icons
-keep class com.horcrux.svg.** { *; }

# Suppress ProGuard / R8 warnings
-dontwarn com.facebook.react.**
-dontwarn expo.modules.**
-dontwarn com.swmansion.reanimated.**
