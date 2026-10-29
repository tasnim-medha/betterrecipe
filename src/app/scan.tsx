
import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const STORAGE_KEY = '@betterrecipe_inventory';

type Ingredient = {
    id: number;
    name: string;
    quantity: string;
};

type DetectedIngredient = {
    id: string;
    name: string;
    quantity: string;
    selected: boolean;
};

export default function ScanScreen() {
    const router = useRouter();

    const [imageUri, setImageUri] = useState<string | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [detectedIngredients, setDetectedIngredients] =
        useState<DetectedIngredient[]>([]);

    async function chooseImage() {
        try {
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
                setDetectedIngredients([]);
            }
        } catch {
            Alert.alert('Error', 'Could not open the photo gallery.');
        }
    }

    async function takePhoto() {
        try {
            const permission =
                await ImagePicker.requestCameraPermissionsAsync();

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
                setDetectedIngredients([]);
            }
        } catch {
            Alert.alert('Error', 'Could not open the camera.');
        }
    }

    async function analyzeIngredients() {
        if (!imageUri) {
            Alert.alert(
                'No image selected',
                'Please choose or take a photo first.',
            );
            return;
        }

        if (
            !GEMINI_API_KEY ||
            // @ts-ignore
            GEMINI_API_KEY === 'PASTE_YOUR_NEW_GEMINI_API_KEY_HERE'
        ) {
            Alert.alert(
                'API key needed',
                'Add your Gemini API key inside scan.tsx first.',
            );
            return;
        }

        try {
            setIsAnalyzing(true);
            setDetectedIngredients([]);

            const processedImage = await ImageManipulator.manipulateAsync(
                imageUri,
                [],
                {
                    compress: 0.7,
                    format: ImageManipulator.SaveFormat.JPEG,
                    base64: true,
                },
            );

            if (!processedImage.base64) {
                throw new Error('Could not prepare the image.');
            }

            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({
                model: 'gemini-3.6-flash',
            });

            const result = await model.generateContent([
                {
                    text:
                        'Identify the visible food ingredients in this image. ' +
                        'Return ONLY a valid JSON array, with no markdown or extra text. ' +
                        'Each array item must have exactly these fields: ' +
                        '"name" (string) and "quantity" (string). ' +
                        'Estimate quantity only when reasonable. If quantity cannot ' +
                        'be estimated, use "1 item". Include only identifiable food ' +
                        'ingredients. Do not invent hidden ingredients. ' +
                        'Example: [{"name":"Tomato","quantity":"2 pieces"},' +
                        '{"name":"Potato","quantity":"3 pieces"}].',
                },
                {
                    inlineData: {
                        mimeType: 'image/jpeg',
                        data: processedImage.base64,
                    },
                },
            ]);

            const response = await result.response;
            const answer = response.text().trim();

            if (!answer) {
                throw new Error('The AI returned an empty response.');
            }

            const cleanedAnswer = answer
                .replace(/^```(?:json)?\s*/i, '')
                .replace(/\s*```$/, '')
                .trim();

            const parsed: unknown = JSON.parse(cleanedAnswer);

            if (!Array.isArray(parsed)) {
                throw new Error('The AI returned an unexpected result.');
            }

            const ingredients: DetectedIngredient[] = parsed
                .filter(
                    (item): item is { name: string; quantity?: string } =>
                        typeof item === 'object' &&
                        item !== null &&
                        'name' in item &&
                        typeof item.name === 'string' &&
                        item.name.trim().length > 0,
                )
                .map((item, index) => ({
                    id: `${Date.now()}-${index}`,
                    name: item.name.trim(),
                    quantity:
                        typeof item.quantity === 'string' &&
                            item.quantity.trim()
                            ? item.quantity.trim()
                            : '1 item',
                    selected: true,
                }));

            if (ingredients.length === 0) {
                throw new Error(
                    'No identifiable ingredients were found. Try another photo.',
                );
            }

            setDetectedIngredients(ingredients);
        } catch (error) {
            console.error('Ingredient analysis failed:', error);

            Alert.alert(
                'Analysis failed',
                error instanceof Error
                    ? error.message
                    : 'Could not identify ingredients. Please try again.',
            );
        } finally {
            setIsAnalyzing(false);
        }
    }

    function toggleIngredient(id: string) {
        setDetectedIngredients((current) =>
            current.map((ingredient) =>
                ingredient.id === id
                    ? { ...ingredient, selected: !ingredient.selected }
                    : ingredient,
            ),
        );
    }

    function updateQuantity(id: string, quantity: string) {
        setDetectedIngredients((current) =>
            current.map((ingredient) =>
                ingredient.id === id
                    ? { ...ingredient, quantity }
                    : ingredient,
            ),
        );
    }

    async function addSelectedToInventory() {
        const selected = detectedIngredients.filter(
            (ingredient) => ingredient.selected,
        );

        if (selected.length === 0) {
            Alert.alert(
                'Nothing selected',
                'Select at least one ingredient to add.',
            );
            return;
        }

        const invalidQuantity = selected.some(
            (ingredient) => !ingredient.quantity.trim(),
        );

        if (invalidQuantity) {
            Alert.alert(
                'Quantity needed',
                'Enter a quantity for each selected ingredient.',
            );
            return;
        }

        try {
            setIsSaving(true);

            // Read the latest inventory before adding anything.
            const saved = await AsyncStorage.getItem(STORAGE_KEY);
            let currentInventory: Ingredient[] = [];

            if (saved !== null) {
                const parsed: unknown = JSON.parse(saved);

                if (!Array.isArray(parsed)) {
                    throw new Error('Your saved inventory has an invalid format.');
                }

                currentInventory = parsed as Ingredient[];
            }

            const newIngredients: Ingredient[] = selected.map(
                (ingredient, index) => ({
                    id: Date.now() + index,
                    name: ingredient.name.trim(),
                    quantity: ingredient.quantity.trim(),
                }),
            );

            // Keep existing ingredients and append the newly selected ones.
            const updatedInventory = [
                ...currentInventory,
                ...newIngredients,
            ];

            await AsyncStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(updatedInventory),
            );

            Alert.alert(
                'Ingredients added!',
                `${newIngredients.length} ingredient${newIngredients.length === 1 ? '' : 's'
                } saved to My Inventory.`,
                [
                    {
                        text: 'Stay here',
                        style: 'cancel',
                    },
                    {
                        text: 'Open My Inventory',
                        onPress: () => router.push('/inventory'),
                    },
                ],
            );
        } catch (error) {
            console.error('Could not save scanned ingredients:', error);

            Alert.alert(
                'Could not save',
                'Your inventory was not updated. Please try again.',
            );
        } finally {
            setIsSaving(false);
        }
    }

    function removeImage() {
        setImageUri(null);
        setDetectedIngredients([]);
    }

    const selectedCount = detectedIngredients.filter(
        (ingredient) => ingredient.selected,
    ).length;

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
        >
            <Pressable
                onPress={() => router.back()}
                style={styles.backButton}
            >
                <Text style={styles.backText}>← Back</Text>
            </Pressable>

            <Text style={styles.eyebrow}>
                BETTERRECIPE · SMART SCANNER
            </Text>

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
                        <Text style={styles.previewTitle}>
                            Your ingredient photo
                        </Text>
                        <Text style={styles.previewSubtitle}>
                            Your selected image will appear here.
                        </Text>
                    </>
                )}
            </View>

            <Pressable
                style={styles.primaryButton}
                onPress={takePhoto}
                disabled={isAnalyzing || isSaving}
            >
                <Text style={styles.primaryButtonText}>Take a photo</Text>
            </Pressable>

            <Pressable
                style={styles.secondaryButton}
                onPress={chooseImage}
                disabled={isAnalyzing || isSaving}
            >
                <Text style={styles.secondaryButtonText}>
                    Choose from gallery
                </Text>
            </Pressable>

            {imageUri && (
                <>
                    <Pressable
                        style={[
                            styles.analyzeButton,
                            isAnalyzing && styles.disabledButton,
                        ]}
                        onPress={analyzeIngredients}
                        disabled={isAnalyzing || isSaving}
                    >
                        {isAnalyzing ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color="#214A37" />
                                <Text style={styles.analyzeButtonText}>
                                    Analyzing ingredients...
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.analyzeButtonText}>
                                Analyze Ingredients →
                            </Text>
                        )}
                    </Pressable>

                    <Pressable
                        style={styles.removeImageButton}
                        onPress={removeImage}
                        disabled={isAnalyzing || isSaving}
                    >
                        <Text style={styles.removeImageText}>
                            Remove selected image
                        </Text>
                    </Pressable>
                </>
            )}

            {detectedIngredients.length > 0 && (
                <View style={styles.results}>
                    <Text style={styles.resultsTitle}>
                        Review Ingredients
                    </Text>

                    <Text style={styles.resultsSubtitle}>
                        Untick anything you don't want to add. You can edit
                        each quantity before saving.
                    </Text>

                    {detectedIngredients.map((ingredient) => (
                        <View
                            key={ingredient.id}
                            style={styles.ingredientCard}
                        >
                            <Pressable
                                style={styles.selectionRow}
                                onPress={() =>
                                    toggleIngredient(ingredient.id)
                                }
                            >
                                <View
                                    style={[
                                        styles.checkbox,
                                        ingredient.selected &&
                                        styles.checkboxSelected,
                                    ]}
                                >
                                    {ingredient.selected && (
                                        <Text style={styles.checkmark}>✓</Text>
                                    )}
                                </View>

                                <Text style={styles.ingredientName}>
                                    {ingredient.name}
                                </Text>
                            </Pressable>

                            <Text style={styles.quantityLabel}>
                                Quantity
                            </Text>

                            <TextInput
                                style={styles.quantityInput}
                                value={ingredient.quantity}
                                onChangeText={(value) =>
                                    updateQuantity(ingredient.id, value)
                                }
                                placeholder="e.g. 2 pieces"
                                placeholderTextColor="#89948A"
                                editable={!isSaving}
                            />
                        </View>
                    ))}

                    <Text style={styles.selectedCount}>
                        {selectedCount} of {detectedIngredients.length} selected
                    </Text>

                    <Pressable
                        style={[
                            styles.saveButton,
                            (isSaving || selectedCount === 0) &&
                            styles.disabledButton,
                        ]}
                        onPress={addSelectedToInventory}
                        disabled={isSaving || selectedCount === 0}
                    >
                        {isSaving ? (
                            <View style={styles.loadingRow}>
                                <ActivityIndicator color="#FFFFFF" />
                                <Text style={styles.saveButtonText}>
                                    Saving ingredients...
                                </Text>
                            </View>
                        ) : (
                            <Text style={styles.saveButtonText}>
                                + Add selected to inventory
                            </Text>
                        )}
                    </Pressable>
                </View>
            )}

            <View style={styles.note}>
                <Text style={styles.noteTitle}>
                    AI ingredient recognition
                </Text>
                <Text style={styles.noteText}>
                    Gemini suggests ingredients visible in your photo.
                    Check the names and quantities before saving, because
                    image-based estimates may not be exact.
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
    analyzeButton: {
        backgroundColor: '#DCEBCF',
        borderRadius: 14,
        padding: 16,
        alignItems: 'center',
        marginTop: 14,
    },
    analyzeButtonText: {
        color: '#214A37',
        fontSize: 15,
        fontWeight: '800',
    },
    disabledButton: {
        opacity: 0.65,
    },
    loadingRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    removeImageButton: {
        alignItems: 'center',
        padding: 14,
    },
    removeImageText: {
        color: '#A04444',
        fontSize: 13,
        fontWeight: '600',
    },
    results: {
        marginTop: 20,
        padding: 17,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: '#DCE4D6',
    },
    resultsTitle: {
        color: '#235B43',
        fontSize: 19,
        fontWeight: '800',
        marginBottom: 8,
    },
    resultsSubtitle: {
        color: '#657267',
        fontSize: 13,
        lineHeight: 20,
        marginBottom: 14,
    },
    ingredientCard: {
        borderWidth: 1,
        borderColor: '#DCE4D6',
        borderRadius: 13,
        padding: 13,
        marginBottom: 10,
        backgroundColor: '#FBFCF8',
    },
    selectionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    checkbox: {
        width: 23,
        height: 23,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: '#8AA091',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkboxSelected: {
        backgroundColor: '#235B43',
        borderColor: '#235B43',
    },
    checkmark: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    ingredientName: {
        flex: 1,
        color: '#20372B',
        fontSize: 15,
        fontWeight: '700',
    },
    quantityLabel: {
        color: '#657267',
        fontSize: 12,
        marginTop: 12,
        marginBottom: 5,
    },
    quantityInput: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DCE4D6',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        color: '#20372B',
        fontSize: 14,
    },
    selectedCount: {
        color: '#568066',
        fontSize: 13,
        fontWeight: '700',
        marginTop: 5,
        marginBottom: 12,
    },
    saveButton: {
        backgroundColor: '#235B43',
        borderRadius: 13,
        padding: 16,
        alignItems: 'center',
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
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
