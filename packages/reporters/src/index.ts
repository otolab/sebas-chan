export class Reporter {
  constructor(public name: string) {
    console.log(`Reporter ${name} initialized`);
  }

  async collect() {
    console.log(`${this.name} collecting data...`);
    return { data: 'sample' };
  }
}

export default Reporter;
