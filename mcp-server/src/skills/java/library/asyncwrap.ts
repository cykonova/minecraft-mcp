import {ISkillServiceParams} from '../../../types/skillType.js';

interface IAsyncwrapOptions {
  func: Function;
  getStatsData: ISkillServiceParams['getStatsData'];
  setStatsData: ISkillServiceParams['setStatsData'];
}

/**
 * Used for wrapping function calls with await() in skills, to accurately time computation time.
 * This does mean that the function being called will not be counted in the computation time, so make sure that the function you're calling isn't also using this wrapper.
 *
 * @param {object} options
 * @param {Function} options.func - The function to wrap with async.
 * @param {Function} options.getStatsData - The function to get the stats data from evaluateCode.
 * @param {Function} options.setStatsData - The function to set the stats data from evaluateCode.
 *
 * @return {Promise<any>} The result of the function call.
 */
export const asyncwrap = async (options: IAsyncwrapOptions): Promise<any> => {
  const {func, getStatsData, setStatsData} = options;
  const start = Date.now();
  const result = await func();
  const end = Date.now();
  const waitTime = getStatsData('waitTime');
  setStatsData('waitTime', waitTime + end - start);

  return result;
};


