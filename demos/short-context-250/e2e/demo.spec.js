import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
const questions=JSON.parse(readFileSync(new URL('../source/questions.json',import.meta.url)));

test('reviews all ten prompts with the production quiz, real media, and raster cards',async({page},info)=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/');
  const voice=info.project.name==='chromium'?'otani':'morioki';
  await page.getByRole('combobox',{name:'Voice',exact:true}).selectOption(voice);
  await page.getByRole('button',{name:'Begin review'}).click();
  for(let i=0;i<questions.length;i++){
    const q=questions[i];
    await expect(page.locator('.contextual-quiz')).toHaveAttribute('data-question-id',`short-demo-${q.id}-question`);
    const replay=page.getByRole('button',{name:q.question?'Replay sentence and question':'Replay sentence',exact:true});
    await expect(replay).toBeVisible();
    // Real audio must decode and finish. Autoplay policies may require Replay.
    if(await page.getByText('Ready to listen.',{exact:false}).isVisible())await replay.click();
    await expect.poll(()=>page.locator('.contextual-quiz audio').evaluate(a=>a.readyState)).toBeGreaterThanOrEqual(2);
    await expect.poll(()=>page.locator('.contextual-quiz audio').evaluate(a=>a.muted)).toBeTruthy();
    await expect.poll(()=>page.locator('.contextual-quiz audio').evaluate(a=>a.src)).toContain(`/audio/${voice}/`);
    if(q.question)await expect.poll(()=>page.locator('.contextual-quiz audio').evaluate(a=>a.src),{timeout:10000}).toContain(`${q.id}-question.mp3`);
    await expect.poll(()=>page.locator('.contextual-quiz audio').evaluate(a=>a.ended),{timeout:15000}).toBeTruthy();
    await expect(page.locator('.answer-choice img')).toHaveCount(4);
    await expect(page.locator('.answer-choice svg')).toHaveCount(0);
    expect(await page.locator('.answer-choice img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0))).toBeTruthy();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    if(i===0){
      await expect(page.locator('.answer-choice').first()).toHaveCSS('border-width','6px');
      await expect(page.locator('.app')).toHaveAttribute('data-theme','contextualQuiz');
      await page.screenshot({path:`test-results/actual-quiz-${info.project.name}.png`,fullPage:true});
      // Wrong answer exposes the real app's Japanese/English details dialog.
      const wrong=q.choices.find(choice=>choice.id!==q.correct);
      await page.getByRole('button',{name:new RegExp(wrong.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
      await page.getByRole('button',{name:'Show Japanese'}).click();
      await expect(page.getByRole('dialog')).toContainText(q.sentence);
      await page.getByRole('button',{name:'Show English'}).click();
      await expect(page.getByRole('dialog')).toContainText(q.english);
      await page.getByRole('button',{name:'Close Japanese'}).click();
    }else{
      const correct=q.choices.find(choice=>choice.id===q.correct);
      await page.getByRole('button',{name:new RegExp(correct.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'))}).click();
      await expect(page.locator('[data-correct="true"]')).toHaveCount(1);
    }
    await page.getByRole('button',{name:'Continue'}).click();
  }
  await expect(page.getByRole('heading',{name:'Nice listening!'})).toBeVisible();
  await expect(page.getByText('9 of 10 matched on the first try')).toBeVisible();
  await page.getByRole('button',{name:'Try again'}).click();
  await expect(page.locator('.contextual-quiz')).toHaveAttribute('data-question-id','short-demo-hitotsu-question');
  expect(errors).toEqual([]);
});

test('retains the production replay/error boundary and exact per-card source records',async({page})=>{
  await page.route('**/audio/**/*.mp3',route=>route.abort());
  await page.goto('/');
  await page.getByRole('button',{name:'Begin review'}).click();
  await expect(page.getByRole('alert')).toContainText('The sound couldn’t play');
  await expect(page.locator('.answer-choice').first()).toBeDisabled();
  await page.unroute('**/audio/**/*.mp3');
  await page.getByRole('button',{name:'Replay sentence',exact:true}).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.answer-choice').first()).toBeEnabled();
  await page.getByRole('button',{name:'Kikimashta home'}).click();
  await page.getByRole('link',{name:'Review artwork and source records'}).click();
  await expect(page.locator('.art-card')).toHaveCount(40);
  expect(await page.locator('.art-card img').evaluateAll(async images=>{
    await Promise.all(images.map(image=>image.decode()));
    return images.every(image=>image.complete&&image.naturalWidth>0);
  })).toBeTruthy();
});

test('shows all 74 short drafts with reused image identities and explicit planned art',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/drafts.html');
  await expect(page.locator('.draft-word')).toHaveCount(37);
  await expect(page.locator('.draft-prompt')).toHaveCount(74);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  // Decode each existing image in the complete review, including lazy images.
  expect(await page.locator('.draft-picture img').evaluateAll(async images=>{
    await Promise.all(images.map(image=>{image.loading='eager';return image.decode();}));
    return images.every(image=>image.naturalWidth>0);
  })).toBeTruthy();
  await page.getByRole('combobox',{name:'Word',exact:true}).selectOption('ja-v-277587e6fa07');
  await expect(page.locator('.draft-prompt')).toHaveCount(2);
  const one=await page.locator('.draft-picture img').evaluateAll(images=>images.map(image=>image.src).sort());
  await page.getByRole('combobox',{name:'Word',exact:true}).selectOption('ja-v-bb85f028d944');
  const two=await page.locator('.draft-picture img').evaluateAll(images=>images.map(image=>image.src).sort());
  expect(two).toEqual(one);
  await page.getByRole('checkbox',{name:'Show correct answers'}).check();
  await expect(page.locator('.draft-picture.correct')).toHaveCount(2);
  await page.screenshot({path:`test-results/shared-draft-cards-${info.project.name}.png`});
  await page.getByRole('combobox',{name:'Word',exact:true}).selectOption('all');
  await page.getByRole('button',{name:'Show shared cards'}).click();
  await expect(page.locator('.draft-card-record')).toHaveCount(69);
  await expect(page.locator('.draft-art-brief')).toHaveCount(13);
  expect(errors).toEqual([]);
});
