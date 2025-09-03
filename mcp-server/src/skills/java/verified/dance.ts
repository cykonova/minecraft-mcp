import { Bot } from 'mineflayer';
import { ISkillServiceParams, ISkillParams } from '../../../types/skillType.js';
import mineflayer_pathfinder from 'mineflayer-pathfinder';
const { goals, Movements } = mineflayer_pathfinder;
import { Vec3 } from 'vec3';
import { isSignalAborted, validateSkillParams } from '../index.js';
const { GoalXZ } = goals;

/**
 * Dance around for a specific amount of time
 * @param {Object} bot - The Mineflayer bot instance.
 * @param {object} params
 * @param {number} params.time - OPTIONAL: The number of seconds to dance for, defaults to 10 seconds if not specified., maximum of 60 seconds
 * @param {name} params.name - OPTIONAL: The name of the person to dance with.
 * @param {ISkillServiceParams} serviceParams - additional parameters for the skill function.
 *
 * @return {Promise<boolean>} - Returns true if the bot successfully ran away from the target, false otherwise.
 */
export const dance = async (
  bot: Bot,
  params: ISkillParams,
  serviceParams: ISkillServiceParams,
): Promise<boolean> => {
  const skillName = 'dance';
  const requiredParams: string[] = [];
  const isParamsValid = validateSkillParams(
    params,
    requiredParams,
    skillName,
  );
  if (!isParamsValid) {
    serviceParams.cancelExecution?.();
    bot.emit(
      'alteraBotEndObservation',
      `Mistake: You didn't provide all of the required parameters ${requiredParams.join(', ')} for the ${skillName} skill.`,
    );
    return false;
  }

  const unpackedParams = {
    name: params.name ?? null,
    time: params.time ?? 10,
    signal: serviceParams.signal,
  };
  const { name, signal } = unpackedParams;
  const DANCE_INTERVAL = 180000; // 3 minutes

  // Check if the bot is already dancing
  const time = Math.min(60, unpackedParams.time); // Ensure time is at most 60 seconds

  const start = bot.entity.position.clone();

  if (bot.lastDanceTime && Date.now() - bot.lastDanceTime < DANCE_INTERVAL) {
    return bot.emit(
      'alteraBotEndObservation',
      `You've danced recently and are too tired to dance right.  You might want to comment on this.`,
    );
  }

  bot.lastDanceTime = Date.now();

  if (name) {
    // TODO: got to and look at the person were "dancing" with
  }

  const moves = [
    // async () => {
    //   console.log('Dancing: Walking back and forth with state');
    //   await bot.setControlState('back', true);
    //   await new Promise(resolve => setTimeout(resolve, 1000));
    //   await bot.setControlState('forward', true);
    //   await new Promise(resolve => setTimeout(resolve, 1000));
    //   await bot.setControlState('back', false);
    //   await bot.setControlState('forward', false);

    // },

    // async () => {
    //   console.log('Dancing: Walking back and forth');
    //   // Walk back and forth x
    //   await walk(bot, start.offset(-1, 0, 0));
    //   await walk(bot, start.offset(1, 0, 0));
    // },

    // async () => {
    //   console.log('Dancing: Walking back and forth z');
    //   // Walk back and forth z
    //   await walk(bot, start.offset(0, 0, -1));
    //   await walk(bot, start.offset(0, 0, 1));
    // },

    async () => {
      console.log('Dancing: Swinging arms');
      // Wave hands (look up and down rapidly)
      for (let i = 0; i < 5; i++) {
        bot.swingArm(undefined);

        await bot.look(0, Math.PI / 2, false);
        bot.swingArm('left');

        await bot.look(0, -Math.PI / 2, false);
        bot.swingArm('right');
        bot.swingArm('left');
      }

      await bot.look(0, 0, false);
    },

    async () => {
      console.log('Dancing: spinning moon walk');
      // Spin
      for (let i = 0; i < 4; i++) {
        await bot.look((Math.PI / 2) * i, 0, false);
        await bot.setControlState('back', true);
        bot.swingArm(undefined);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await bot.setControlState('back', false);
        bot.swingArm('left');
      }
    },

    async () => {
      console.log('Dancing: turning around');
      // Turn around
      await bot.look(Math.PI, 0, false);
    },

    async () => {
      // Jump
      console.log('Dancing: Jumping');
      await bot.setControlState('jump', true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await bot.setControlState('jump', false);
    },

    async () => {
      // crouch
      console.log('Dancing: Crouching');
      await bot.setControlState('sneak', true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await bot.setControlState('sneak', false);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await bot.setControlState('sneak', true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await bot.setControlState('sneak', false);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await bot.setControlState('sneak', true);
      await new Promise((resolve) => setTimeout(resolve, 200));
      await bot.setControlState('sneak', false);
    },
    async () => {
      // crouch 2 - timing variant
      console.log('Dancing: Crouching 2');
      await bot.setControlState('sneak', true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await bot.setControlState('sneak', false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await bot.setControlState('sneak', true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await bot.setControlState('sneak', false);
      await new Promise((resolve) => setTimeout(resolve, 100));
      await bot.setControlState('sneak', true);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await bot.setControlState('sneak', false);
    },
  ];

  let dancing = true;
  const timer = setTimeout(() => {
    dancing = false;
  }, time * 1000);

  while (dancing) {
    if (typeof signal !== 'undefined' && signal?.aborted) {
      return bot.emit(
        'alteraBotEndObservation',
        `You decided to do something else and stopped dancing.`,
      );
    }

    const randomMove = moves[Math.floor(Math.random() * moves.length)];
    await randomMove();
  }
  return bot.emit(
    'alteraBotEndObservation',
    `You finished dancing for ${time} seconds.`,
  );
};

const walk = async (bot: Bot, position: Vec3) => {
  const defaultMove = new Movements(bot);
  bot.pathfinder.setMovements(defaultMove);
  // GoalXZ do not accept bot.world and {range: 0} as a parameter. Old code =>  const defaultMovements = new GoalXZ(position, bot.world, {range: 0});
  const goal = new GoalXZ(position.x, position.z);
  await bot.pathfinder.goto(goal);
};


