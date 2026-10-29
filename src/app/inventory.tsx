
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from 'react-native';

type Ingredient = {
    id: number;
    name: string;
    quantity: string;
};

const STORAGE_KEY = '@betterrecipe_inventory';

export default function InventoryScreen() {
    const router = useRouter();

    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [name, setName] = useState('');
    const [quantity, setQuantity] = useState('');
    const [isLoaded, setIsLoaded] = useState(false);

    // Load saved ingredients when the screen opens
    useEffect(() => {
        async function loadIngredients() {
            try {
                const savedIngredients =
                    await AsyncStorage.getItem(STORAGE_KEY);

                if (savedIngredients !== null) {
                    const parsed: unknown = JSON.parse(savedIngredients);

                    if (
                        Array.isArray(parsed) &&
                        parsed.every(
                            (item) =>
                                typeof item.id === 'number' &&
                                typeof item.name === 'string' &&
                                typeof item.quantity === 'string',
                        )
                    ) {
                        setIngredients(parsed as Ingredient[]);
                    }
                }
            } catch (error) {
                console.error('Failed to load inventory:', error);
                Alert.alert(
                    'Storage error',
                    'Your saved inventory could not be loaded.',
                );
            } finally {
                setIsLoaded(true);
            }
        }

        loadIngredients();
    }, []);

    // Save changes only after the initial load finishes
    useEffect(() => {
        if (!isLoaded) return;

        AsyncStorage.setItem(
            STORAGE_KEY,
            JSON.stringify(ingredients),
        ).catch((error) => {
            console.error('Failed to save inventory:', error);
            Alert.alert(
                'Save error',
                'Your inventory could not be saved. Please try again.',
            );
        });
    }, [ingredients, isLoaded]);

    function addIngredient() {
        const trimmedName = name.trim();
        const trimmedQuantity = quantity.trim();

        if (!trimmedName || !trimmedQuantity) {
            Alert.alert(
                'Missing information',
                'Enter an ingredient and its quantity.',
            );
            return;
        }

        setIngredients((current) => [
            ...current,
            {
                id: Date.now(),
                name: trimmedName,
                quantity: trimmedQuantity,
            },
        ]);

        setName('');
        setQuantity('');
    }

    function removeIngredient(id: number) {
        setIngredients((current) =>
            current.filter((ingredient) => ingredient.id !== id),
        );
    }

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
                BETTERRECIPE · YOUR KITCHEN
            </Text>

            <Text style={styles.title}>My Inventory</Text>

            <Text style={styles.subtitle}>
                Keep track of the ingredients you have at home.
            </Text>

            <View style={styles.summary}>
                <Text style={styles.summaryLabel}>
                    INGREDIENTS IN YOUR INVENTORY
                </Text>

                <Text style={styles.summaryNumber}>
                    {ingredients.length}
                </Text>

                <Text style={styles.summaryCaption}>
                    items saved on this device
                </Text>
            </View>

            <View style={styles.form}>
                <Text style={styles.sectionTitle}>
                    Add an ingredient
                </Text>

                <TextInput
                    style={styles.input}
                    placeholder="Ingredient name (e.g. Tomatoes)"
                    placeholderTextColor="#89948A"
                    value={name}
                    onChangeText={setName}
                />

                <TextInput
                    style={styles.input}
                    placeholder="Quantity (e.g. 4 pieces)"
                    placeholderTextColor="#89948A"
                    value={quantity}
                    onChangeText={setQuantity}
                />

                <Pressable
                    style={styles.addButton}
                    onPress={addIngredient}
                >
                    <Text style={styles.addButtonText}>
                        + Add ingredient
                    </Text>
                </Pressable>
            </View>

            <Text style={styles.sectionTitle}>
                Your ingredients
            </Text>

            {!isLoaded ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyText}>
                        Loading your saved inventory...
                    </Text>
                </View>
            ) : ingredients.length === 0 ? (
                <View style={styles.emptyState}>
                    <Text style={styles.emptyIcon}>🥬</Text>

                    <Text style={styles.emptyTitle}>
                        Your inventory is empty
                    </Text>

                    <Text style={styles.emptyText}>
                        Add your first ingredient above to get started.
                    </Text>
                </View>
            ) : (
                ingredients.map((ingredient) => (
                    <View
                        key={ingredient.id}
                        style={styles.ingredientCard}
                    >
                        <View style={styles.ingredientInfo}>
                            <Text style={styles.ingredientName}>
                                {ingredient.name}
                            </Text>

                            <Text style={styles.ingredientQuantity}>
                                {ingredient.quantity}
                            </Text>
                        </View>

                        <Pressable
                            style={styles.removeButton}
                            onPress={() => removeIngredient(ingredient.id)}
                        >
                            <Text style={styles.removeText}>
                                Remove
                            </Text>
                        </Pressable>
                    </View>
                ))
            )}
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
    },
    subtitle: {
        color: '#6C786E',
        fontSize: 14,
        lineHeight: 22,
        marginTop: 10,
        marginBottom: 24,
    },
    summary: {
        backgroundColor: '#235B43',
        borderRadius: 20,
        padding: 22,
        marginBottom: 24,
    },
    summaryLabel: {
        color: '#DCEBCF',
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1,
    },
    summaryNumber: {
        color: '#FFFFFF',
        fontSize: 42,
        fontWeight: '800',
        marginTop: 8,
    },
    summaryCaption: {
        color: '#E1EBDD',
        fontSize: 12,
        marginTop: 2,
    },
    form: {
        backgroundColor: '#FFFFFF',
        padding: 18,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#DCE4D6',
        marginBottom: 26,
    },
    sectionTitle: {
        color: '#20372B',
        fontSize: 17,
        fontWeight: '800',
        marginBottom: 14,
    },
    input: {
        backgroundColor: '#F7F8F2',
        borderWidth: 1,
        borderColor: '#DCE4D6',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 13,
        color: '#20372B',
        fontSize: 14,
        marginBottom: 12,
    },
    addButton: {
        backgroundColor: '#235B43',
        borderRadius: 12,
        padding: 15,
        alignItems: 'center',
    },
    addButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
    },
    emptyState: {
        backgroundColor: '#E9EEE3',
        borderRadius: 18,
        padding: 25,
        alignItems: 'center',
    },
    emptyIcon: {
        fontSize: 38,
        marginBottom: 12,
    },
    emptyTitle: {
        color: '#365C43',
        fontSize: 15,
        fontWeight: '800',
    },
    emptyText: {
        color: '#657267',
        fontSize: 13,
        textAlign: 'center',
        lineHeight: 20,
        marginTop: 7,
    },
    ingredientCard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#DCE4D6',
        borderRadius: 14,
        padding: 15,
        marginBottom: 10,
    },
    ingredientInfo: {
        flex: 1,
        marginRight: 10,
    },
    ingredientName: {
        color: '#20372B',
        fontSize: 15,
        fontWeight: '700',
    },
    ingredientQuantity: {
        color: '#6C786E',
        fontSize: 12,
        marginTop: 5,
    },
    removeButton: {
        padding: 8,
    },
    removeText: {
        color: '#A04444',
        fontSize: 12,
        fontWeight: '700',
    },
});
