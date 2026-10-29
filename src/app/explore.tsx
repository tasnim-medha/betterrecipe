
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

export default function ScanScreen() {
  const router = useRouter();
  const [imageUri, setImageUri] = useState<string | null>(null);

  async function chooseImage() {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow photo library access to choose an ingredient image.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Please allow camera access to photograph your ingredients.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.8,
    });

    if (!result.canceled && result.assets.length > 0) {
      setImageUri(result.assets[0].uri);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Pressable onPress={() => router.back()} style={styles.backButton}>
        <Text style={styles.backText}>← Back to home</Text>
      </Pressable>

      <Text style={styles.eyebrow}>SMART INGREDIENT SCANNER</Text>
      <Text style={styles.title}>What's in your kitchen?</Text>
      <Text style={styles.subtitle}>
        Take a photo or choose an existing image of your ingredients.
      </Text>

      <View style={styles.preview}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} />
        ) : (
          <>
            <Text style={styles.previewIcon}>🥬</Text>
            <Text style={styles.previewTitle}>Your ingredient photo</Text>
            <Text style={styles.previewSubtitle}>
              Your selected image will appear here.
            </Text>
          </>
        )}
      </View>

      <Pressable style={styles.primaryButton} onPress={takePhoto}>
        <Text style={styles.primaryButtonText}>Take a photo</Text>
      </Pressable>

      <Pressable style={styles.secondaryButton} onPress={chooseImage}>
        <Text style={styles.secondaryButtonText}>Choose from gallery</Text>
      </Pressable>

      {imageUri && (
        <Pressable
          style={styles.removeButton}
          onPress={() => setImageUri(null)}
        >
          <Text style={styles.removeText}>Remove selected image</Text>
        </Pressable>
      )}

      <View style={styles.note}>
        <Text style={styles.noteTitle}>Next step: ingredient recognition</Text>
        <Text style={styles.noteText}>
          This version lets you select or photograph an image. It does not
          identify ingredients automatically yet.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F8F2',
  },
  content: {
    padding: 22,
    paddingTop: 24,
    paddingBottom: 40,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 30,
  },
  backText: {
    color: '#235B43',
    fontSize: 14,
    fontWeight: '700',
  },
  eyebrow: {
    color: '#568066',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    marginBottom: 10,
  },
  title: {
    color: '#20372B',
    fontSize: 29,
    fontWeight: '800',
    lineHeight: 36,
  },
  subtitle: {
    color: '#6C786E',
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 24,
  },
  preview: {
    height: 250,
    backgroundColor: '#E9EEE3',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#DCE4D6',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    overflow: 'hidden',
    marginBottom: 18,
  },
  previewIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  previewTitle: {
    color: '#365C43',
    fontSize: 16,
    fontWeight: '700',
  },
  previewSubtitle: {
    color: '#788379',
    fontSize: 12,
    marginTop: 7,
    textAlign: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
    resizeMode: 'cover',
  },
  primaryButton: {
    backgroundColor: '#235B43',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DCE4D6',
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#235B43',
    fontSize: 15,
    fontWeight: '700',
  },
  removeButton: {
    alignItems: 'center',
    padding: 14,
  },
  removeText: {
    color: '#A04444',
    fontSize: 13,
    fontWeight: '600',
  },
  note: {
    marginTop: 26,
    padding: 17,
    backgroundColor: '#E9EEE3',
    borderRadius: 16,
  },
  noteTitle: {
    color: '#365C43',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 7,
  },
  noteText: {
    color: '#657267',
    fontSize: 13,
    lineHeight: 20,
  },
});
