/**
 * Simple test to validate composite skills instantiation and basic functionality
 */

import 'reflect-metadata';
import { container } from 'tsyringe';
import { 
    FollowPlayerSkill, 
    GuardPlayerSkill, 
    MineOreVeinSkill, 
    BuildStructureSkill,
    registerCompositeSkills,
    COMPOSITE_SKILL_REGISTRY 
} from './index.js';

/**
 * Test composite skills instantiation
 */
async function testCompositeSkillInstantiation(): Promise<void> {
    console.log('🧪 Testing Composite Skills Instantiation');
    console.log('==========================================');

    try {
        // Register composite skills
        registerCompositeSkills();
        console.log('✅ Composite skills registered successfully');

        // Test individual skill instantiation
        const followSkill = new FollowPlayerSkill();
        console.log(`✅ FollowPlayerSkill created: ${followSkill.name} (${followSkill.edition})`);

        const guardSkill = new GuardPlayerSkill();
        console.log(`✅ GuardPlayerSkill created: ${guardSkill.name} (${guardSkill.edition})`);

        const mineSkill = new MineOreVeinSkill();
        console.log(`✅ MineOreVeinSkill created: ${mineSkill.name} (${mineSkill.edition})`);

        const buildSkill = new BuildStructureSkill();
        console.log(`✅ BuildStructureSkill created: ${buildSkill.name} (${buildSkill.edition})`);

        console.log('\n📊 Composite Skills Summary:');
        console.log(`- Total composite skills: ${Object.keys(COMPOSITE_SKILL_REGISTRY).length}`);
        
        for (const [skillName, metadata] of Object.entries(COMPOSITE_SKILL_REGISTRY)) {
            console.log(`  • ${skillName}: ${metadata.dependencies.length} dependencies`);
        }

        console.log('\n🎉 All composite skills instantiated successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

/**
 * Test skill schemas and basic properties
 */
async function testSkillSchemas(): Promise<void> {
    console.log('\n🔍 Testing Skill Schemas');
    console.log('========================');

    const skills = [
        new FollowPlayerSkill(),
        new GuardPlayerSkill(),
        new MineOreVeinSkill(),
        new BuildStructureSkill()
    ];

    for (const skill of skills) {
        console.log(`\n📝 ${skill.name}:`);
        console.log(`  - Category: ${skill.category}`);
        console.log(`  - Edition: ${skill.edition}`);
        console.log(`  - Version: ${skill.version}`);
        console.log(`  - Dependencies: ${skill.skillDependencies.length}`);
        console.log(`  - Required params: ${skill.inputSchema.required?.length || 0}`);
        console.log(`  - Schema properties: ${Object.keys(skill.inputSchema.properties || {}).length}`);
        
        // Validate basic schema structure
        if (!skill.inputSchema.type) {
            throw new Error(`${skill.name} missing inputSchema.type`);
        }
        if (!skill.inputSchema.properties) {
            throw new Error(`${skill.name} missing inputSchema.properties`);
        }
        console.log(`  ✅ Schema validation passed`);
    }

    console.log('\n✅ All skill schemas are valid!');
}

/**
 * Test dependency resolution metadata
 */
async function testDependencyMetadata(): Promise<void> {
    console.log('\n🔗 Testing Dependency Metadata');
    console.log('===============================');

    const skills = [
        new FollowPlayerSkill(),
        new GuardPlayerSkill(), 
        new MineOreVeinSkill(),
        new BuildStructureSkill()
    ];

    for (const skill of skills) {
        console.log(`\n🔍 ${skill.name} dependencies:`);
        
        for (const depName of skill.skillDependencies) {
            console.log(`  - ${depName}`);
        }

        // Test execution step creation
        const sampleParams = getSampleParams(skill.name);
        const steps = (skill as any).createExecutionSteps(sampleParams);
        
        console.log(`  📋 Execution steps: ${steps.length}`);
        for (const step of steps) {
            console.log(`    • ${step.description} (${step.estimatedTime}ms)`);
        }
    }

    console.log('\n✅ Dependency metadata test completed!');
}

/**
 * Get sample parameters for testing each skill
 */
function getSampleParams(skillName: string): Record<string, any> {
    const sampleParams: Record<string, Record<string, any>> = {
        followPlayer: { playerName: 'TestPlayer', distance: 3, duration: 60 },
        guardPlayer: { playerName: 'TestPlayer', duration: 120, guardDistance: 4 },
        mineOreVein: { oreType: 'iron_ore', maxBlocks: 32, systematic: true },
        buildStructure: { blueprintName: 'simple_house', systematic: true }
    };

    return sampleParams[skillName] || {};
}

/**
 * Run all tests
 */
async function runAllTests(): Promise<void> {
    try {
        await testCompositeSkillInstantiation();
        await testSkillSchemas();
        await testDependencyMetadata();
        
        console.log('\n🎉 ALL TESTS PASSED! 🎉');
        console.log('Composite skills are ready for use.');
        
    } catch (error) {
        console.error('\n💥 TESTS FAILED:', error);
        process.exit(1);
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests();
}

export { testCompositeSkillInstantiation, testSkillSchemas, testDependencyMetadata, runAllTests };