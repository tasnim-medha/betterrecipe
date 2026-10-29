import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
    SafeAreaView,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

type RecipeFixture = {
    id: string;
    name: string;
    ingredients: string[];
    minutes: number;
    cost: number;
    nutrition: number; // illustrative normalized score: 0-1
    tags: string[];
};

type EvaluationCase = {
    id: string;
    title: string;
    inventory: string[];
    relevantRecipeIds: string[];
    dietaryRestrictions?: string[];
    maxTime?: number;
    maxBudget?: number;
};

type RankedRecipe = RecipeFixture & {
    score: number;
    matchedCount: number;
    coverage: number;
};

const K = 3;

// DEMONSTRATION FIXTURE ONLY. Replace these recipes and labels with a frozen,
// documented dataset and relevance judgments before reporting thesis results.
const RECIPES: RecipeFixture[] = [
    {
        id: 'r1',
        name: 'Tomato Egg Rice',
        ingredients: ['rice', 'egg', 'tomato', 'onion'],
        minutes: 20,
        cost: 90,
        nutrition: 0.78,
        tags: ['balanced'],
    },
    {
        id: 'r2',
        name: 'Chicken Rice Bowl',
        ingredients: ['rice', 'chicken', 'onion', 'garlic'],
        minutes: 30,
        cost: 180,
        nutrition: 0.82,
        tags: ['high-protein'],
    },
    {
        id: 'r3',
        name: 'Vegetable Omelette',
        ingredients: ['egg', 'tomato', 'onion', 'spinach'],
        minutes: 15,
        cost: 80,
        nutrition: 0.88,
        tags: ['vegetarian', 'low-cost'],
    },
    {
        id: 'r4',
        name: 'Garlic Chicken',
        ingredients: ['chicken', 'garlic', 'onion', 'oil'],
        minutes: 25,
        cost: 170,
        nutrition: 0.72,
        tags: ['high-protein'],
    },
    {
        id: 'r5',
        name: 'Tomato Rice',
        ingredients: ['rice', 'tomato', 'onion', 'oil'],
        minutes: 22,
        cost: 70,
        nutrition: 0.65,
        tags: ['vegetarian', 'low-cost'],
    },
    {
        id: 'r6',
        name: 'Spinach Egg Rice',
        ingredients: ['rice', 'egg', 'spinach', 'garlic'],
        minutes: 18,
        cost: 100,
        nutrition: 0.91,
        tags: ['vegetarian', 'balanced'],
    },
    {
        id: 'r7',
        name: 'Chicken Tomato Salad',
        ingredients: ['chicken', 'tomato', 'spinach', 'oil'],
        minutes: 17,
        cost: 200,
        nutrition: 0.94,
        tags: ['high-protein', 'low-carb'],
    },
    {
        id: 'r8',
        name: 'Simple Garlic Rice',
        ingredients: ['rice', 'garlic', 'oil', 'onion'],
        minutes: 16,
        cost: 60,
        nutrition: 0.58,
        tags: ['vegetarian', 'low-cost'],
    },
];

const TEST_CASES: EvaluationCase[] = [
    {
        id: 'case1',
        title: 'Everyday pantry ingredients',
        inventory: ['rice', 'egg', 'tomato', 'onion'],
        relevantRecipeIds: ['r1', 'r5', 'r6'],
        maxTime: 25,
        maxBudget: 120,
    },
    {
        id: 'case2',
        title: 'Chicken and aromatics available',
        inventory: ['chicken', 'onion', 'garlic', 'oil'],
        relevantRecipeIds: ['r4', 'r2', 'r7'],
        maxTime: 30,
        maxBudget: 190,
        dietaryRestrictions: [],
    },
    {
        id: 'case3',
        title: 'Vegetarian quick meal',
        inventory: ['egg', 'tomato', 'spinach', 'onion'],
        relevantRecipeIds: ['r3', 'r6', 'r1'],
        maxTime: 20,
        maxBudget: 120,
        dietaryRestrictions: ['vegetarian'],
    },
];

const normalize = (value: string) => value.trim().toLowerCase();

function getCoverage(recipe: RecipeFixture, inventory: string[]) {
    const available = new Set(inventory.map(normalize));
    const matchedCount = recipe.ingredients.filter((item) =>
        available.has(normalize(item)),
    ).length;
    return {
        matchedCount,
        coverage: recipe.ingredients.length
            ? matchedCount / recipe.ingredients.length
            : 0,
    };
}

// Baseline: order primarily by number of matched ingredients, then coverage.
// This mirrors the simple ingredient-matching strategy in the live screen.
function rankBaseline(
    recipes: RecipeFixture[],
    inventory: string[],
): RankedRecipe[] {
    return recipes
        .map((recipe) => {
            const match = getCoverage(recipe, inventory);
            return { ...recipe, ...match, score: match.matchedCount };
        })
        .sort(
            (a, b) =>
                b.matchedCount - a.matchedCount ||
                b.coverage - a.coverage ||
                a.id.localeCompare(b.id),
        );
}

// Proposed: weighted coverage, time, cost, nutrition and dietary fit.
// Weights are illustrative and must be justified/frozen before the final study.
// A factor is omitted and weights renormalized when its input is unavailable.
function rankProposed(
    recipes: RecipeFixture[],
    testCase: EvaluationCase,
): RankedRecipe[] {
    const weights = {
        coverage: 0.5,
        time: 0.15,
        cost: 0.15,
        nutrition: 0.1,
        dietary: 0.1,
    };

    return recipes
        .map((recipe) => {
            const match = getCoverage(recipe, testCase.inventory);
            const factors: Array<{ value: number; weight: number }> = [
                { value: match.coverage, weight: weights.coverage },
            ];

            if (typeof testCase.maxTime === 'number' && testCase.maxTime > 0) {
                factors.push({
                    value: Math.max(0, Math.min(1, 1 - recipe.minutes / (testCase.maxTime * 1.5))),
                    weight: weights.time,
                });
            }
            if (typeof testCase.maxBudget === 'number' && testCase.maxBudget > 0) {
                factors.push({
                    value: Math.max(0, Math.min(1, 1 - recipe.cost / (testCase.maxBudget * 1.5))),
                    weight: weights.cost,
                });
            }
            if (Number.isFinite(recipe.nutrition)) {
                factors.push({
                    value: Math.max(0, Math.min(1, recipe.nutrition)),
                    weight: weights.nutrition,
                });
            }
            if (testCase.dietaryRestrictions && testCase.dietaryRestrictions.length > 0) {
                const compatible = testCase.dietaryRestrictions.every((restriction) =>
                    recipe.tags.includes(restriction),
                );
                factors.push({
                    value: compatible ? 1 : 0,
                    weight: weights.dietary,
                });
            }

            const totalWeight = factors.reduce((sum, factor) => sum + factor.weight, 0);
            const score = totalWeight
                ? factors.reduce((sum, factor) => sum + factor.value * factor.weight, 0) /
                totalWeight
                : 0;

            return { ...recipe, ...match, score };
        })
        .sort(
            (a, b) =>
                b.score - a.score ||
                b.matchedCount - a.matchedCount ||
                a.id.localeCompare(b.id),
        );
}

function precisionAtK(ranked: RankedRecipe[], relevantIds: string[], k: number) {
    const relevant = new Set(relevantIds);
    const top = ranked.slice(0, k);
    if (!top.length) return 0;
    return top.filter((recipe) => relevant.has(recipe.id)).length / k;
}

function recallAtK(ranked: RankedRecipe[], relevantIds: string[], k: number) {
    if (!relevantIds.length) return 0;
    const relevant = new Set(relevantIds);
    const found = ranked.slice(0, k).filter((recipe) => relevant.has(recipe.id)).length;
    return found / relevant.size;
}

function ndcgAtK(ranked: RankedRecipe[], relevantIds: string[], k: number) {
    const relevant = new Set(relevantIds);
    const dcg = ranked.slice(0, k).reduce((sum, recipe, index) => {
        const gain = relevant.has(recipe.id) ? 1 : 0;
        return sum + gain / Math.log2(index + 2);
    }, 0);
    const idealCount = Math.min(relevant.size, k);
    const idealDcg: any = Array.from({ length: idealCount }).reduce(
        (sum: any, _, index) => sum + 1 / Math.log2(index + 2),
        0,
    );
    return idealDcg ? dcg / idealDcg : 0;
}

function topKAccuracy(ranked: RankedRecipe[], relevantIds: string[], k: number) {
    const relevant = new Set(relevantIds);
    return ranked.slice(0, k).some((recipe) => relevant.has(recipe.id)) ? 1 : 0;
}

function average(values: number[]) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function metricSet(ranked: RankedRecipe[], relevantIds: string[]) {
    return {
        precision: precisionAtK(ranked, relevantIds, K),
        recall: recallAtK(ranked, relevantIds, K),
        ndcg: ndcgAtK(ranked, relevantIds, K),
        topK: topKAccuracy(ranked, relevantIds, K),
    };
}

const percent = (value: number) => `${(value * 100).toFixed(1)}%`;

export default function EvaluationScreen() {
    const router = useRouter();
    const [selectedCaseId, setSelectedCaseId] = useState(TEST_CASES[0].id);

    const selectedCase = TEST_CASES.find((item) => item.id === selectedCaseId) ?? TEST_CASES[0];

    const evaluation = useMemo(() => {
        const rows = TEST_CASES.map((testCase) => {
            const baseline = metricSet(
                rankBaseline(RECIPES, testCase.inventory),
                testCase.relevantRecipeIds,
            );
            const proposed = metricSet(rankProposed(RECIPES, testCase), testCase.relevantRecipeIds);
            return { id: testCase.id, title: testCase.title, baseline, proposed };
        });

        return {
            rows,
            baselineAverage: {
                precision: average(rows.map((row) => row.baseline.precision)),
                recall: average(rows.map((row) => row.baseline.recall)),
                ndcg: average(rows.map((row) => row.baseline.ndcg)),
                topK: average(rows.map((row) => row.baseline.topK)),
            },
            proposedAverage: {
                precision: average(rows.map((row) => row.proposed.precision)),
                recall: average(rows.map((row) => row.proposed.recall)),
                ndcg: average(rows.map((row) => row.proposed.ndcg)),
                topK: average(rows.map((row) => row.proposed.topK)),
            },
        };
    }, []);

    const baselineRanking = rankBaseline(RECIPES, selectedCase.inventory);
    const proposedRanking = rankProposed(RECIPES, selectedCase);
    const relevantSet = new Set(selectedCase.relevantRecipeIds);

    const renderMetric = (label: string, baseline: number, proposed: number) => (
        <View key={label} style={styles.metricRow}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{percent(baseline)}</Text>
            <Text style={styles.metricValue}>{percent(proposed)}</Text>
        </View>
    );

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
                <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                    <Text style={styles.backButtonText}>← Back</Text>
                </TouchableOpacity>

                <Text style={styles.brand}>BETTERRECIPE · THESIS TOOLS</Text>
                <Text style={styles.title}>Ranking Evaluation</Text>
                <Text style={styles.subtitle}>
                    Compare the ingredient-match baseline with the proposed weighted ranking using identical
                    test cases and relevance labels.
                </Text>

                <View style={styles.warningCard}>
                    <Text style={styles.warningTitle}>Demo data — not thesis results</Text>
                    <Text style={styles.warningText}>
                        This screen currently uses a small hand-authored fixture and illustrative relevance
                        labels. Do not report these scores as experimental findings. Replace the fixture with a
                        frozen recipe dataset and document how relevance labels were assigned.
                    </Text>
                </View>

                <Text style={styles.sectionTitle}>Average results · Precision@{K}, Recall@{K}, nDCG@{K}</Text>
                <View style={styles.table}>
                    <View style={[styles.metricRow, styles.tableHeader]}>
                        <Text style={styles.metricLabel}>Metric</Text>
                        <Text style={styles.metricHeaderValue}>Baseline</Text>
                        <Text style={styles.metricHeaderValue}>Proposed</Text>
                    </View>
                    {renderMetric('Precision@3', evaluation.baselineAverage.precision, evaluation.proposedAverage.precision)}
                    {renderMetric('Recall@3', evaluation.baselineAverage.recall, evaluation.proposedAverage.recall)}
                    {renderMetric('nDCG@3', evaluation.baselineAverage.ndcg, evaluation.proposedAverage.ndcg)}
                    {renderMetric('Top-3 accuracy', evaluation.baselineAverage.topK, evaluation.proposedAverage.topK)}
                </View>
                <Text style={styles.caption}>
                    Values are the macro-average across {TEST_CASES.length} fixed demo cases. Top-3 accuracy
                    means at least one labelled-relevant recipe appears in the top three.
                </Text>

                <Text style={styles.sectionTitle}>Inspect a test case</Text>
                {TEST_CASES.map((testCase) => (
                    <TouchableOpacity
                        key={testCase.id}
                        style={[
                            styles.caseButton,
                            selectedCaseId === testCase.id && styles.caseButtonSelected,
                        ]}
                        onPress={() => setSelectedCaseId(testCase.id)}
                    >
                        <Text
                            style={[
                                styles.caseButtonText,
                                selectedCaseId === testCase.id && styles.caseButtonTextSelected,
                            ]}
                        >
                            {testCase.title}
                        </Text>
                    </TouchableOpacity>
                ))}

                <View style={styles.card}>
                    <Text style={styles.cardTitle}>{selectedCase.title}</Text>
                    <Text style={styles.smallLabel}>Inventory</Text>
                    <Text style={styles.bodyText}>{selectedCase.inventory.join(', ')}</Text>
                    <Text style={styles.smallLabel}>Labelled relevant recipe IDs</Text>
                    <Text style={styles.bodyText}>{selectedCase.relevantRecipeIds.join(', ')}</Text>
                    <Text style={styles.smallLabel}>Constraints used by proposed ranking</Text>
                    <Text style={styles.bodyText}>
                        {selectedCase.maxTime ? `Time limit: ${selectedCase.maxTime} min` : 'No time limit'}
                        {' · '}
                        {selectedCase.maxBudget ? `Budget: ${selectedCase.maxBudget} units` : 'No budget'}
                        {selectedCase.dietaryRestrictions?.length
                            ? ` · Dietary: ${selectedCase.dietaryRestrictions.join(', ')}`
                            : ''}
                    </Text>
                </View>

                <Text style={styles.sectionTitle}>Top {K}: baseline</Text>
                {baselineRanking.slice(0, K).map((recipe, index) => (
                    <View key={recipe.id} style={styles.rankRow}>
                        <Text style={styles.rankNumber}>{index + 1}</Text>
                        <View style={styles.rankDetails}>
                            <Text style={styles.rankName}>{recipe.name}</Text>
                            <Text style={styles.rankMeta}>
                                {recipe.matchedCount}/{recipe.ingredients.length} ingredients matched ·{' '}
                                {percent(recipe.coverage)} coverage
                            </Text>
                        </View>
                        <Text style={[styles.relevanceTag, relevantSet.has(recipe.id) && styles.relevantTag]}>
                            {relevantSet.has(recipe.id) ? 'Relevant' : 'Not labelled'}
                        </Text>
                    </View>
                ))}

                <Text style={styles.sectionTitle}>Top {K}: proposed</Text>
                {proposedRanking.slice(0, K).map((recipe, index) => (
                    <View key={recipe.id} style={styles.rankRow}>
                        <Text style={styles.rankNumber}>{index + 1}</Text>
                        <View style={styles.rankDetails}>
                            <Text style={styles.rankName}>{recipe.name}</Text>
                            <Text style={styles.rankMeta}>
                                Score {recipe.score.toFixed(3)} · {recipe.matchedCount}/{recipe.ingredients.length}{' '}
                                ingredients matched
                            </Text>
                        </View>
                        <Text style={[styles.relevanceTag, relevantSet.has(recipe.id) && styles.relevantTag]}>
                            {relevantSet.has(recipe.id) ? 'Relevant' : 'Not labelled'}
                        </Text>
                    </View>
                ))}

                <View style={styles.methodCard}>
                    <Text style={styles.cardTitle}>Method notes</Text>
                    <Text style={styles.methodText}>
                        • Both algorithms rank the same eight recipes for each test case.
                    </Text>
                    <Text style={styles.methodText}>
                        • Baseline uses matched ingredient count, then ingredient coverage.
                    </Text>
                    <Text style={styles.methodText}>
                        • Proposed uses coverage (weight 0.50), time (0.15), cost (0.15), nutrition (0.10),
                        and dietary compatibility (0.10), renormalizing when a factor is not supplied.
                    </Text>
                    <Text style={styles.methodText}>
                        • These weights, fixture values, and relevance labels are placeholders. Freeze and
                        justify them before the formal evaluation; do not tune weights on the test cases.
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: '#F7F8F4' },
    container: { padding: 20, paddingBottom: 40 },
    backButton: {
        alignSelf: 'flex-start',
        backgroundColor: '#E8EDE4',
        borderRadius: 12,
        paddingHorizontal: 14,
        paddingVertical: 9,
        marginBottom: 20,
    },
    backButtonText: { color: '#243629', fontWeight: '700', fontSize: 14 },
    brand: { color: '#64816A', fontSize: 11, letterSpacing: 2, fontWeight: '800', marginBottom: 10 },
    title: { fontSize: 29, lineHeight: 35, color: '#1D2B20', fontWeight: '800', marginBottom: 8 },
    subtitle: { fontSize: 14, lineHeight: 21, color: '#637066', marginBottom: 18 },
    warningCard: {
        backgroundColor: '#FFF3D8',
        borderColor: '#F0D49B',
        borderWidth: 1,
        borderRadius: 16,
        padding: 15,
        marginBottom: 24,
    },
    warningTitle: { color: '#7C4D00', fontWeight: '800', fontSize: 14, marginBottom: 5 },
    warningText: { color: '#775D32', fontSize: 12, lineHeight: 18 },
    sectionTitle: { color: '#26372A', fontSize: 17, fontWeight: '800', marginTop: 18, marginBottom: 11 },
    table: { borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#E1E7DE' },
    tableHeader: { backgroundColor: '#E9EFE6' },
    metricRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#FFFFFF',
        paddingVertical: 12,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#EEF0EB',
    },
    metricLabel: { flex: 1.5, color: '#344338', fontSize: 12, fontWeight: '700' },
    metricHeaderValue: { flex: 1, color: '#344338', textAlign: 'right', fontSize: 11, fontWeight: '800' },
    metricValue: { flex: 1, color: '#344338', textAlign: 'right', fontSize: 12, fontVariant: ['tabular-nums'] },
    caption: { color: '#778178', fontSize: 11, lineHeight: 16, marginTop: 8 },
    caseButton: {
        borderRadius: 12,
        padding: 13,
        marginBottom: 8,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E1E7DE',
    },
    caseButtonSelected: { backgroundColor: '#E7F0E4', borderColor: '#6D936D' },
    caseButtonText: { color: '#48564B', fontWeight: '700', fontSize: 13 },
    caseButtonTextSelected: { color: '#244C2A' },
    card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 15, marginTop: 8 },
    cardTitle: { color: '#26372A', fontWeight: '800', fontSize: 15, marginBottom: 12 },
    smallLabel: { color: '#748175', fontSize: 10, fontWeight: '800', textTransform: 'uppercase', marginTop: 8, marginBottom: 3 },
    bodyText: { color: '#3E4A40', fontSize: 13, lineHeight: 19 },
    rankRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 13,
        backgroundColor: '#FFFFFF',
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#E7EBE4',
    },
    rankNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        overflow: 'hidden',
        textAlign: 'center',
        textAlignVertical: 'center',
        backgroundColor: '#E9EFE6',
        color: '#34513A',
        fontWeight: '800',
        paddingTop: 5,
        marginRight: 10,
    },
    rankDetails: { flex: 1 },
    rankName: { color: '#26372A', fontSize: 13, fontWeight: '800' },
    rankMeta: { color: '#778178', fontSize: 11, marginTop: 4, lineHeight: 15 },
    relevanceTag: { color: '#818981', fontSize: 10, fontWeight: '700', marginLeft: 7 },
    relevantTag: { color: '#267340' },
    methodCard: { backgroundColor: '#EDF2E9', borderRadius: 16, padding: 15, marginTop: 20 },
    methodText: { color: '#4D5D4F', fontSize: 12, lineHeight: 19, marginBottom: 6 },
});
