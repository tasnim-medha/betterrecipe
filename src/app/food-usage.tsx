
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

type Ingredient = {
    id: number;
    name: string;
    quantity: string;
};

type UsageLog = {
    id: string;
    ingredientName: string;
    initialQuantity: number;
    usedQuantity: number;
    discardedQuantity: number;
    remainingQuantity: number;
    unit: string;
    wastePercentage: number;
    date: string;
    note?: string;
};

type Entry = {
    used: string;
    discarded: string;
};

const INVENTORY_KEY = '@betterrecipe_inventory';
const LOGS_KEY = '@betterrecipe_food_usage_logs';

function parseQuantity(value: string) {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(.*)$/);

    if (!match) return null;

    const amount = Number(match[1]);

    if (!Number.isFinite(amount) || amount < 0) return null;

    return {
        amount,
        unit: match[2].trim(),
    };
}

function formatQuantity(amount: number, unit: string) {
    const formatted = Number(amount.toFixed(3)).toString();
    return unit ? `${formatted} ${unit}` : formatted;
}

function formatDate(value: string) {
    return new Date(value).toLocaleString();
}

export default function FoodUsageScreen() {
    const router = useRouter();

    const [inventory, setInventory] = useState<Ingredient[]>([]);
    const [logs, setLogs] = useState<UsageLog[]>([]);
    const [selectedIds, setSelectedIds] = useState<number[]>([]);
    const [entries, setEntries] = useState<Record<string, Entry>>({});
    const [note, setNote] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);

            const [inventoryData, logsData] = await Promise.all([
                AsyncStorage.getItem(INVENTORY_KEY),
                AsyncStorage.getItem(LOGS_KEY),
            ]);

            const parsedInventory = inventoryData
                ? JSON.parse(inventoryData)
                : [];

            const parsedLogs = logsData ? JSON.parse(logsData) : [];

            setInventory(
                Array.isArray(parsedInventory) ? parsedInventory : [],
            );
            setLogs(Array.isArray(parsedLogs) ? parsedLogs : []);
        } catch {
            Alert.alert('Could not load data', 'Please reopen this screen.');
        } finally {
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            void loadData();
        }, [loadData]),
    );

    const averageWaste =
        logs.length > 0
            ? logs.reduce((sum, log) => sum + log.wastePercentage, 0) /
            logs.length
            : 0;

    const toggleIngredient = (id: number) => {
        setSelectedIds((current) => {
            if (current.includes(id)) {
                return current.filter((itemId) => itemId !== id);
            }

            return [...current, id];
        });
    };

    const updateEntry = (
        id: number,
        field: keyof Entry,
        value: string,
    ) => {
        setEntries((current) => ({
            ...current,
            [String(id)]: {
                used: current[String(id)]?.used ?? '',
                discarded: current[String(id)]?.discarded ?? '',
                [field]: value,
            },
        }));
    };

    const saveAll = async () => {
        if (selectedIds.length === 0) {
            Alert.alert(
                'Select ingredients',
                'Choose one or more ingredients before saving.',
            );
            return;
        }

        const transactions: UsageLog[] = [];
        const updatedInventory = inventory.map((item) => ({ ...item }));
        const now = new Date().toISOString();

        for (const id of selectedIds) {
            const item = inventory.find((ingredient) => ingredient.id === id);

            if (!item) {
                Alert.alert('Ingredient not found', 'Reload your inventory and try again.');
                return;
            }

            const stock = parseQuantity(item.quantity);

            if (!stock) {
                Alert.alert(
                    'Unsupported quantity',
                    `${item.name} has quantity "${item.quantity}". Please use a quantity format such as "2 kg", "4 pieces", or "3" in Inventory.`,
                );
                return;
            }

            const entry = entries[String(id)] ?? {
                used: '',
                discarded: '',
            };

            const used = entry.used.trim() === '' ? 0 : Number(entry.used);
            const discarded =
                entry.discarded.trim() === '' ? 0 : Number(entry.discarded);

            if (
                !Number.isFinite(used) ||
                !Number.isFinite(discarded) ||
                used < 0 ||
                discarded < 0
            ) {
                Alert.alert(
                    'Invalid quantity',
                    `Enter valid, non-negative quantities for ${item.name}.`,
                );
                return;
            }

            if (used + discarded <= 0) {
                Alert.alert(
                    'Missing quantities',
                    `Enter a used or discarded quantity for ${item.name}, or deselect it.`,
                );
                return;
            }

            if (used + discarded > stock.amount + 0.000001) {
                Alert.alert(
                    'Not enough stock',
                    `${item.name}: you have ${item.quantity}. The used and discarded quantities combined cannot exceed the available amount.`,
                );
                return;
            }

            const remaining = Math.max(
                0,
                stock.amount - used - discarded,
            );

            transactions.push({
                id: `${Date.now()}-${id}-${Math.random().toString(36).slice(2, 7)}`,
                ingredientName: item.name,
                initialQuantity: stock.amount,
                usedQuantity: used,
                discardedQuantity: discarded,
                remainingQuantity: remaining,
                unit: stock.unit,
                wastePercentage:
                    stock.amount > 0 ? (discarded / stock.amount) * 100 : 0,
                date: now,
                note: note.trim() || undefined,
            });

            const inventoryIndex = updatedInventory.findIndex(
                (ingredient) => ingredient.id === id,
            );

            if (inventoryIndex !== -1) {
                updatedInventory[inventoryIndex] = {
                    ...updatedInventory[inventoryIndex],
                    quantity: formatQuantity(remaining, stock.unit),
                };
            }
        }

        const updatedLogs = [...transactions, ...logs];

        try {
            setSaving(true);

            // Write the new history and inventory after all selected
            // ingredients have passed validation.
            await AsyncStorage.setItem(LOGS_KEY, JSON.stringify(updatedLogs));
            await AsyncStorage.setItem(
                INVENTORY_KEY,
                JSON.stringify(updatedInventory),
            );

            setLogs(updatedLogs);
            setInventory(updatedInventory);
            setSelectedIds([]);
            setEntries({});
            setNote('');

            Alert.alert(
                'All ingredients saved!',
                `${transactions.length} ingredient(s) recorded and inventory updated.`,
            );
        } catch {
            Alert.alert(
                'Save error',
                'Storage may be partially updated. Reopen Inventory and Food Usage to check your quantities before trying again.',
            );

            await loadData();
        } finally {
            setSaving(false);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.screen}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <ScrollView
                contentContainerStyle={styles.container}
                keyboardShouldPersistTaps="handled"
            >
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.backText}>← Back</Text>
                </TouchableOpacity>

                <Text style={styles.brand}>BETTERRECIPE</Text>
                <Text style={styles.title}>Food Usage & Waste</Text>
                <Text style={styles.subtitle}>
                    Select multiple ingredients, record what you used or discarded,
                    and update your kitchen stock in one go.
                </Text>

                <View style={styles.infoCard}>
                    <Text style={styles.infoTitle}>Waste calculation</Text>
                    <Text style={styles.infoText}>
                        Waste % = discarded quantity ÷ stock before this transaction × 100.
                    </Text>
                    <Text style={styles.infoNote}>
                        Enter amounts in the same unit shown in your inventory.
                    </Text>
                </View>

                {loading ? (
                    <ActivityIndicator
                        size="large"
                        color="#25845A"
                        style={styles.loader}
                    />
                ) : (
                    <>
                        <View style={styles.summaryRow}>
                            <View style={styles.summaryCard}>
                                <Text style={styles.summaryNumber}>{logs.length}</Text>
                                <Text style={styles.summaryLabel}>Recorded entries</Text>
                            </View>

                            <View style={styles.summaryCard}>
                                <Text style={styles.summaryNumber}>
                                    {averageWaste.toFixed(1)}%
                                </Text>
                                <Text style={styles.summaryLabel}>Average entry waste</Text>
                            </View>
                        </View>

                        <View style={styles.sectionHeader}>
                            <View style={styles.sectionHeaderText}>
                                <Text style={styles.sectionTitle}>
                                    1. Select ingredients
                                </Text>
                                <Text style={styles.helperText}>
                                    Tap as many items as you need.
                                </Text>
                            </View>

                            {selectedIds.length > 0 && (
                                <TouchableOpacity
                                    onPress={() => setSelectedIds([])}
                                >
                                    <Text style={styles.clearText}>Clear all</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {inventory.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyTitle}>
                                    Your inventory is empty
                                </Text>
                                <Text style={styles.emptyText}>
                                    Add ingredients in My Inventory before recording usage.
                                </Text>
                                <TouchableOpacity
                                    style={styles.secondaryButton}
                                    onPress={() => router.push('/inventory')}
                                >
                                    <Text style={styles.secondaryButtonText}>
                                        Open My Inventory
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View style={styles.ingredientList}>
                                {inventory.map((item) => {
                                    const isSelected = selectedIds.includes(item.id);

                                    return (
                                        <TouchableOpacity
                                            key={item.id}
                                            style={[
                                                styles.ingredientCard,
                                                isSelected && styles.selectedIngredient,
                                            ]}
                                            onPress={() => toggleIngredient(item.id)}
                                            activeOpacity={0.75}
                                        >
                                            <View
                                                style={[
                                                    styles.checkbox,
                                                    isSelected && styles.checkedBox,
                                                ]}
                                            >
                                                {isSelected && (
                                                    <Text style={styles.checkmark}>✓</Text>
                                                )}
                                            </View>

                                            <View style={styles.ingredientInfo}>
                                                <Text style={styles.ingredientName}>
                                                    {item.name}
                                                </Text>
                                                <Text style={styles.ingredientQuantity}>
                                                    Available: {item.quantity}
                                                </Text>
                                            </View>

                                            <Text style={styles.selectText}>
                                                {isSelected ? 'Selected' : 'Select'}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}

                        {selectedIds.length > 0 && (
                            <View style={styles.formCard}>
                                <Text style={styles.sectionTitle}>
                                    2. Enter quantities
                                </Text>
                                <Text style={styles.helperText}>
                                    Each ingredient has its own quantities and stock check.
                                </Text>

                                {selectedIds.map((id) => {
                                    const item = inventory.find(
                                        (ingredient) => ingredient.id === id,
                                    );

                                    if (!item) return null;

                                    const stock = parseQuantity(item.quantity);
                                    const entry = entries[String(id)] ?? {
                                        used: '',
                                        discarded: '',
                                    };

                                    return (
                                        <View key={id} style={styles.entryCard}>
                                            <Text style={styles.entryName}>{item.name}</Text>
                                            <Text style={styles.stockText}>
                                                Available: {item.quantity}
                                            </Text>

                                            <Text style={styles.fieldLabel}>
                                                Quantity used ({stock?.unit || 'inventory unit'})
                                            </Text>
                                            <TextInput
                                                style={styles.input}
                                                value={entry.used}
                                                onChangeText={(value) =>
                                                    updateEntry(id, 'used', value)
                                                }
                                                placeholder="e.g. 0.5"
                                                keyboardType="decimal-pad"
                                            />

                                            <Text style={styles.fieldLabel}>
                                                Quantity discarded ({stock?.unit || 'inventory unit'})
                                            </Text>
                                            <TextInput
                                                style={styles.input}
                                                value={entry.discarded}
                                                onChangeText={(value) =>
                                                    updateEntry(id, 'discarded', value)
                                                }
                                                placeholder="e.g. 0.2"
                                                keyboardType="decimal-pad"
                                            />
                                        </View>
                                    );
                                })}

                                <Text style={styles.fieldLabel}>
                                    Note for this batch (optional)
                                </Text>
                                <TextInput
                                    style={[styles.input, styles.noteInput]}
                                    value={note}
                                    onChangeText={setNote}
                                    placeholder="e.g. used for dinner; some food spoiled"
                                    multiline
                                />

                                <TouchableOpacity
                                    style={[
                                        styles.saveButton,
                                        saving && styles.disabledButton,
                                    ]}
                                    onPress={() => void saveAll()}
                                    disabled={saving}
                                >
                                    <Text style={styles.saveButtonText}>
                                        {saving
                                            ? 'Saving...'
                                            : `Save ${selectedIds.length} ingredient(s) & Update Stock`}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}

                        <Text style={styles.sectionTitle}>
                            3. Transaction history
                        </Text>

                        {logs.length === 0 ? (
                            <View style={styles.emptyCard}>
                                <Text style={styles.emptyTitle}>No records yet</Text>
                                <Text style={styles.emptyText}>
                                    Your saved usage and waste transactions will appear here.
                                </Text>
                            </View>
                        ) : (
                            logs.map((log) => (
                                <View key={log.id} style={styles.historyCard}>
                                    <View style={styles.historyHeader}>
                                        <Text style={styles.historyName}>
                                            {log.ingredientName}
                                        </Text>
                                        <Text style={styles.wasteBadge}>
                                            {log.wastePercentage.toFixed(1)}% waste
                                        </Text>
                                    </View>

                                    <Text style={styles.historyDetail}>
                                        Initial stock: {formatQuantity(log.initialQuantity, log.unit)}
                                    </Text>
                                    <Text style={styles.historyDetail}>
                                        Used: {formatQuantity(log.usedQuantity, log.unit)}
                                    </Text>
                                    <Text style={styles.historyDetail}>
                                        Discarded:{' '}
                                        {formatQuantity(log.discardedQuantity, log.unit)}
                                    </Text>
                                    <Text style={styles.historyDetail}>
                                        Remaining: {formatQuantity(log.remainingQuantity, log.unit)}
                                    </Text>

                                    {log.note ? (
                                        <Text style={styles.noteText}>Note: {log.note}</Text>
                                    ) : null}

                                    <Text style={styles.historyDate}>
                                        {formatDate(log.date)}
                                    </Text>
                                </View>
                            ))
                        )}
                    </>
                )}

                <Text style={styles.footer}>
                    BetterRecipe • Household Food Waste Tracking
                </Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    screen: {
        flex: 1,
        backgroundColor: '#F6F8F5',
    },
    container: {
        padding: 20,
        paddingBottom: 40,
    },
    backButton: {
        alignSelf: 'flex-start',
        marginBottom: 22,
        paddingVertical: 8,
    },
    backText: {
        color: '#25845A',
        fontSize: 15,
        fontWeight: '700',
    },
    brand: {
        color: '#25845A',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 2,
        marginBottom: 8,
    },
    title: {
        color: '#1D3025',
        fontSize: 29,
        fontWeight: '800',
        lineHeight: 36,
    },
    subtitle: {
        color: '#69766C',
        fontSize: 14,
        lineHeight: 21,
        marginTop: 8,
        marginBottom: 22,
    },
    infoCard: {
        backgroundColor: '#E7F2E9',
        borderRadius: 16,
        padding: 16,
        marginBottom: 20,
    },
    infoTitle: {
        color: '#205D3B',
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 7,
    },
    infoText: {
        color: '#355C42',
        fontSize: 13,
        lineHeight: 20,
    },
    infoNote: {
        color: '#53745C',
        fontSize: 12,
        marginTop: 8,
    },
    loader: {
        marginTop: 40,
    },
    summaryRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 25,
    },
    summaryCard: {
        flex: 1,
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 17,
        borderWidth: 1,
        borderColor: '#E7ECE7',
    },
    summaryNumber: {
        color: '#25845A',
        fontSize: 25,
        fontWeight: '800',
    },
    summaryLabel: {
        color: '#758078',
        fontSize: 12,
        marginTop: 6,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
    },
    sectionHeaderText: {
        flex: 1,
    },
    sectionTitle: {
        color: '#1D3025',
        fontSize: 18,
        fontWeight: '800',
        marginTop: 8,
        marginBottom: 12,
    },
    helperText: {
        color: '#758078',
        fontSize: 12,
        lineHeight: 18,
        marginBottom: 8,
    },
    clearText: {
        color: '#B14B3C',
        fontSize: 13,
        fontWeight: '700',
        padding: 8,
    },
    ingredientList: {
        gap: 10,
        marginBottom: 20,
    },
    ingredientCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5EAE5',
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 11,
    },
    selectedIngredient: {
        borderColor: '#25845A',
        borderWidth: 1.5,
        backgroundColor: '#EFF8F0',
    },
    checkbox: {
        width: 23,
        height: 23,
        borderRadius: 7,
        borderWidth: 1.5,
        borderColor: '#BBC7BD',
        alignItems: 'center',
        justifyContent: 'center',
    },
    checkedBox: {
        backgroundColor: '#25845A',
        borderColor: '#25845A',
    },
    checkmark: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    ingredientInfo: {
        flex: 1,
    },
    ingredientName: {
        color: '#24372B',
        fontSize: 15,
        fontWeight: '700',
        textTransform: 'capitalize',
    },
    ingredientQuantity: {
        color: '#758078',
        fontSize: 13,
        marginTop: 5,
    },
    selectText: {
        color: '#25845A',
        fontSize: 12,
        fontWeight: '700',
    },
    formCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 18,
        borderWidth: 1,
        borderColor: '#E5EAE5',
        padding: 16,
        marginBottom: 26,
    },
    entryCard: {
        borderWidth: 1,
        borderColor: '#E5EAE5',
        borderRadius: 13,
        padding: 13,
        marginTop: 12,
        backgroundColor: '#FAFCF9',
    },
    entryName: {
        color: '#24372B',
        fontSize: 16,
        fontWeight: '800',
        textTransform: 'capitalize',
    },
    stockText: {
        color: '#758078',
        fontSize: 12,
        marginTop: 5,
    },
    fieldLabel: {
        color: '#46544A',
        fontSize: 13,
        fontWeight: '700',
        marginTop: 13,
        marginBottom: 7,
    },
    input: {
        backgroundColor: '#F7F9F6',
        borderWidth: 1,
        borderColor: '#E0E6E0',
        borderRadius: 11,
        paddingHorizontal: 13,
        paddingVertical: 12,
        color: '#26362B',
        fontSize: 15,
    },
    noteInput: {
        minHeight: 70,
        textAlignVertical: 'top',
    },
    saveButton: {
        backgroundColor: '#25845A',
        borderRadius: 13,
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 15,
        marginTop: 18,
    },
    disabledButton: {
        opacity: 0.6,
    },
    saveButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '800',
        textAlign: 'center',
    },
    secondaryButton: {
        backgroundColor: '#25845A',
        borderRadius: 10,
        alignSelf: 'flex-start',
        paddingHorizontal: 15,
        paddingVertical: 11,
        marginTop: 15,
    },
    secondaryButtonText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '700',
    },
    emptyCard: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5EAE5',
        borderRadius: 15,
        padding: 18,
        marginBottom: 22,
    },
    emptyTitle: {
        color: '#26372B',
        fontSize: 15,
        fontWeight: '800',
    },
    emptyText: {
        color: '#748077',
        fontSize: 13,
        lineHeight: 19,
        marginTop: 6,
    },
    historyCard: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5EAE5',
        borderRadius: 15,
        padding: 15,
        marginBottom: 11,
    },
    historyHeader: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 10,
    },
    historyName: {
        color: '#24372B',
        fontSize: 16,
        fontWeight: '800',
        flex: 1,
        textTransform: 'capitalize',
    },
    wasteBadge: {
        color: '#A44736',
        backgroundColor: '#FCEDE8',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 5,
        fontSize: 11,
        fontWeight: '800',
    },
    historyDetail: {
        color: '#5E6C62',
        fontSize: 13,
        lineHeight: 21,
    },
    noteText: {
        color: '#536A59',
        fontSize: 12,
        marginTop: 8,
        lineHeight: 18,
    },
    historyDate: {
        color: '#8A948C',
        fontSize: 11,
        marginTop: 10,
    },
    footer: {
        textAlign: 'center',
        color: '#929B94',
        fontSize: 11,
        marginTop: 22,
    },
});
