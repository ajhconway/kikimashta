import { test, expect } from '@playwright/test';
import { questions } from '../dist/questions.js';

test('ten-question session, first answers, transcript controls, and restart',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Short context demo'})).toBeVisible();
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('#sentence')).not.toBeVisible();
  await page.locator('#transcript summary').click();
  await expect(page.locator('#sentence')).toHaveText(questions[0].sentence);
  await expect(page.locator('#sentence-english')).not.toBeVisible();
  await page.getByLabel('English translation').check();
  await expect(page.locator('#sentence-english')).toBeVisible();
  // One intentional miss confirms the correct card and truthful first-answer score.
  await page.locator('[data-choice="apples-3"]').click();
  await expect(page.locator('#feedback')).toContainText('Not quite');
  await expect(page.locator('[data-choice="apples-1"]')).toHaveClass(/correct/);
  await expect(page.locator('.answer-card:disabled')).toHaveCount(4);
  await page.locator('#next').click();
  await expect(page.locator('#transcript')).not.toHaveAttribute('open');
  await expect(page.getByLabel('English translation')).not.toBeChecked();
  for(let i=1;i<questions.length;i++){
    await expect(page.locator('#counter')).toContainText(String(i+1).padStart(2,'0'));
    await page.locator(`[data-choice="${questions[i].correct}"]`).click();
    await expect(page.locator('#feedback')).toContainText('That’s it');
    await page.locator('#next').click();
  }
  await expect(page.locator('#summary')).toBeVisible();
  await expect(page.locator('#summary-score')).toContainText('9 matched on the first try · 0 skipped');
  await page.getByRole('button',{name:'Review 一つ: Review'}).click();
  await expect(page.locator('[data-choice="apples-3"]')).toHaveClass(/incorrect/);
  await page.getByRole('button',{name:'Question 10, answered'}).click();
  await page.getByRole('button',{name:'Finish'}).click();
  await page.getByRole('button',{name:'Try the ten again'}).click();
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('.answer-card:disabled')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('audio loads and decodes; slow playback remains available',async({page})=>{
  await page.goto('/');
  // Listen for the real media element's playback event, without replacing audio.
  await page.evaluate(()=>document.addEventListener('playing',event=>{window.demoAudio=event.target;},{capture:true}));
  await page.getByLabel('Slower',{exact:true}).check();
  const response=page.waitForResponse(response=>response.url().endsWith('/audio/hitotsu.mp3'));
  await page.getByRole('button',{name:'Play the Japanese prompt'}).click();
  expect((await response).ok()).toBeTruthy();
  await expect.poll(()=>page.evaluate(()=>window.demoAudio?.readyState)).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(()=>window.demoAudio.playbackRate)).toBe(.8);
  await expect(page.locator('#audio-status')).toHaveText('');
  await page.locator('#skip').click();
  await page.locator('#play').click();
  await expect.poll(()=>page.evaluate(()=>window.demoAudio?.src)).toContain('chikaraippai.mp3');
  await page.locator('#skip').click();
  expect(await page.evaluate(()=>window.demoAudio.paused)).toBeTruthy();
});

test('broken audio opens readable fallback and supports retry',async({page})=>{
  await page.route('**/audio/*.mp3',route=>route.abort());
  await page.goto('/');
  await page.locator('#play').click();
  await expect(page.locator('#audio-status')).toContainText('Audio could not play');
  await expect(page.locator('#sentence')).toBeVisible();
  await page.unroute('**/audio/*.mp3');
  await page.locator('#play').click();
  await expect(page.locator('#audio-status')).toHaveText('Listening…');
});

test('skipping is reported and all forty pictures render without mobile overflow',async({page})=>{
  await page.goto('/');
  for(let i=0;i<questions.length;i++){
    await expect(page.locator('.answer-card svg')).toHaveCount(4);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
    if(i===0)await page.screenshot({path:`test-results/first-question-${test.info().project.name}.png`,fullPage:true});
    if(i===7){
      await page.locator('#transcript summary').click();
      await expect(page.locator('#review-note')).toBeVisible();
      await page.screenshot({path:`test-results/injury-question-${test.info().project.name}.png`,fullPage:true});
    }
    await page.locator('#skip').click();
  }
  await expect(page.locator('#summary-score')).toContainText('0 matched on the first try · 10 skipped');
});

test('number keys choose cards and repeated keys cannot overwrite a first answer',async({page,isMobile})=>{
  test.skip(isMobile,'Physical keyboard journey is desktop only.');
  await page.goto('/');
  await page.keyboard.press('2');
  await expect(page.locator('#feedback')).toContainText('That’s it');
  await page.keyboard.press('1');
  await expect(page.locator('#feedback')).toContainText('That’s it');
  await expect(page.locator('#next')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#counter')).toContainText('02');
});
